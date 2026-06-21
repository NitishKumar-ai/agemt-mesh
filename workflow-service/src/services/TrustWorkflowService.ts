import {
  Fact,
  graphService,
  GraphService,
  policyEngine,
  PolicyEngine,
} from '@agentmesh/graph-service';
import { WorkflowOutput, Section, Citation } from '../domain/types.js';
import crypto from 'node:crypto';
import type { ConnectionDAO } from '@agentmesh/common-persistence';

type ScopeEntityType =
  | 'Team'
  | 'Incident'
  | 'Service'
  | 'Meeting'
  | 'Account'
  // Growth Memory domain pack scopes.
  | 'Campaign'
  | 'Feature'
  | 'Channel';

/** One channel's funnel, derived from per-channel signups/activated/paid facts. */
interface ChannelFunnelRow {
  channel: string;
  signups: number;
  activated: number;
  paid: number;
  spend: number;
  activationRate: number; // activated / signups, 0..1
  paidRate: number; // paid / signups, 0..1
  costPerPaid: number | null; // spend / paid (CAC), null when no paid or no spend
  qualityScore: number; // composite 0..1, rewards conversion quality over raw volume
  rank: number; // 1-based rank by qualityScore desc within the computed set
}

interface VisibleScopeFacts {
  facts: Fact[];
  conflicts: Fact[];
}

export class TrustWorkflowService {
  public connectionDAO?: ConnectionDAO;

  constructor(
    private readonly graphSvc: GraphService = graphService,
    private readonly policy: PolicyEngine = policyEngine,
  ) {}

  private filterVisibleFacts(facts: Fact[], tenantId: string, userId?: string): Fact[] {
    const access = this.policy.resolveAccess(tenantId, userId);
    return facts.filter((fact) => {
      if (fact.tenant_id !== tenantId) return false;
      const permissionHash = this.graphSvc.getSourcePermissionHash(tenantId, fact.source_id);
      // Unknown ACL state is never treated as public, including for admins.
      return permissionHash !== undefined && this.policy.isVisible(permissionHash, access);
    });
  }

  /**
   * Resolve a human-facing scope through a datastore-independent GraphService
   * query rather than touching Neo4j or fallback internals.
   */
  private async resolveEntityIds(
    tenantId: string,
    entityType: ScopeEntityType,
    lookup: string,
  ): Promise<string[]> {
    const resolvedIds = await this.graphSvc.findCurrentEntityIds(tenantId, entityType, lookup);
    // Treating the lookup as a possible entity ID is safe: the temporal query
    // remains tenant-scoped and returns no data when it is only a display name.
    return resolvedIds.length > 0 ? resolvedIds : [lookup];
  }

  private deduplicateFacts(facts: Fact[]): Fact[] {
    return [...new Map(facts.map((fact) => [fact.id, fact])).values()];
  }

  private async loadCurrentScopeFacts(
    tenantId: string,
    userId: string | undefined,
    scopes: Array<{ type: ScopeEntityType; lookup: string }>,
  ): Promise<VisibleScopeFacts> {
    const resolved = await Promise.all(
      scopes.map((scope) => this.resolveEntityIds(tenantId, scope.type, scope.lookup)),
    );
    const entityIds = [...new Set(resolved.flat())];
    const [factsByEntity, conflictsByEntity] = await Promise.all([
      Promise.all(entityIds.map((id) => this.graphSvc.getFactsCurrent(id, tenantId))),
      Promise.all(entityIds.map((id) => this.graphSvc.getFactsConflicts(id, tenantId))),
    ]);

    return {
      facts: this.deduplicateFacts(this.filterVisibleFacts(factsByEntity.flat(), tenantId, userId)),
      conflicts: this.deduplicateFacts(
        this.filterVisibleFacts(conflictsByEntity.flat(), tenantId, userId),
      ),
    };
  }

  private async loadChangedScopeFacts(
    tenantId: string,
    userId: string | undefined,
    scope: { type: ScopeEntityType; lookup: string },
    from: string,
    to: string,
  ): Promise<VisibleScopeFacts> {
    const entityIds = await this.resolveEntityIds(tenantId, scope.type, scope.lookup);
    const facts = this.deduplicateFacts(
      this.filterVisibleFacts(
        (
          await Promise.all(
            entityIds.map((id) => this.graphSvc.getFactsChanges(id, tenantId, from, to)),
          )
        ).flat(),
        tenantId,
        userId,
      ),
    );
    return {
      facts,
      conflicts: facts.filter((fact) => fact.status === 'contradicted'),
    };
  }

  private formatValue(value: unknown): string {
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private formatFact(fact: Fact): string {
    return `${fact.predicate}: ${this.formatValue(fact.value)}`;
  }

  private selectFacts(facts: Fact[], terms: string[]): Fact[] {
    return facts.filter((fact) => {
      const predicate = fact.predicate.toLowerCase();
      return terms.some((term) => predicate.includes(term));
    });
  }

  private factualSection(title: string, facts: Fact[], emptyMessage: string): Section {
    return {
      title,
      content:
        facts.length > 0 ? facts.map((fact) => this.formatFact(fact)).join('\n') : emptyMessage,
      type: facts.length > 0 ? 'list' : 'alert',
      data: facts,
    };
  }

  private createCitations(facts: Fact[]): Citation[] {
    return facts.map((fact) => {
      const citation: Citation = {
        id: crypto.randomUUID(),
        source_id: fact.source_id,
        title: `Evidence for ${fact.predicate}`,
        url: null,
        confidence: fact.confidence,
      };
      const exactText = fact.evidence_spans[0];
      if (exactText) citation.exact_text = exactText;
      return citation;
    });
  }

  private buildWorkflowOutput(params: {
    workflowId: string;
    tenantId: string;
    scope: string;
    sections: Section[];
    facts: Fact[];
    conflicts: Fact[];
  }): WorkflowOutput {
    const citations = this.createCitations(params.facts);
    const sourceCount = new Set(citations.map((citation) => citation.source_id)).size;
    const warnings: string[] = [];
    if (params.facts.length === 0) {
      warnings.push(
        'No permission-visible cited facts were found for this scope; factual sections abstain.',
      );
    }
    if (params.conflicts.length > 0) {
      warnings.push(
        'Permission-visible sources conflict; verify the cited evidence before acting.',
      );
    }

    const graphSupport = this.calculateGraphSupport(params.facts);
    const calibration = this.calibrateConfidence({
      sourcesCount: sourceCount,
      hasContradictions: params.conflicts.length > 0,
      hasCurrentFact: params.facts.length > 0,
      isAuthoritative: graphSupport.isAuthoritative,
      graphSupportScore: graphSupport.graphSupportScore,
    });

    return {
      workflow_id: params.workflowId,
      tenant_id: params.tenantId,
      scope: params.scope,
      generated_at: new Date().toISOString(),
      sections: params.sections,
      citations,
      confidence: calibration.score,
      warnings,
      correction_url: `/correct?answer_id=${params.workflowId}_${Date.now()}`,
    };
  }

  /**
   * Helper to calibrate confidence score based on the criteria in Section 6.4
   */
  public calibrateConfidence(params: {
    sourcesCount: number;
    hasContradictions: boolean;
    hasCurrentFact: boolean;
    isAuthoritative: boolean;
    graphSupportScore: number;
  }): { score: number; level: 'high' | 'medium' | 'low' | 'abstain' } {
    let score = 0.5;
    score += Math.min(params.sourcesCount * 0.1, 0.3);
    if (params.isAuthoritative) score += 0.15;
    score += params.graphSupportScore * 0.15;
    if (!params.hasCurrentFact) score -= 0.2;
    if (params.hasContradictions) score -= 0.3;
    score = Math.max(0.1, Math.min(1.0, score));

    if (params.hasContradictions || !params.hasCurrentFact || params.sourcesCount === 0) {
      return { score, level: 'abstain' };
    }
    if (score >= 0.75 && params.sourcesCount >= 3) {
      return { score, level: 'high' };
    }
    if (score >= 0.45) {
      return { score, level: 'medium' };
    }
    return { score, level: 'low' };
  }

  /**
   * Computes graph support features from actual fact data for dynamic
   * confidence calibration. Replaces the hardcoded feature inputs that were
   * previously passed to calibrateConfidence.
   *
   * isAuthoritative: true when at least one fact's confidence exceeds the
   * high-authority threshold (0.9), signalling it came from a verified or
   * primary source.
   *
   * graphSupportScore: weighted combination of source corroboration (how many
   * independent sources agree on the same predicate) and recency (more recent
   * facts contribute more). Range 0-1.
   */
  public calculateGraphSupport(facts: Fact[]): {
    isAuthoritative: boolean;
    graphSupportScore: number;
  } {
    if (facts.length === 0) {
      return { isAuthoritative: false, graphSupportScore: 0 };
    }

    // A fact is authoritative when its confidence exceeds this threshold,
    // indicating it was ingested from a verified or primary source system.
    const AUTHORITY_THRESHOLD = 0.9;
    const isAuthoritative = facts.some((f) => f.confidence >= AUTHORITY_THRESHOLD);

    // Source corroboration: for each predicate, count distinct sources.
    // Multiple independent sources for the same predicate increase confidence.
    const predicateSourceMap = new Map<string, Set<string>>();
    for (const fact of facts) {
      const key = fact.predicate;
      if (!predicateSourceMap.has(key)) {
        predicateSourceMap.set(key, new Set());
      }
      predicateSourceMap.get(key)!.add(fact.source_id);
    }

    let totalCorroboration = 0;
    for (const sources of predicateSourceMap.values()) {
      // Each additional independent source beyond 1 adds corroboration.
      // Capped at 3 sources per predicate to avoid over-weighting.
      totalCorroboration += Math.min(sources.size, 3) / 3;
    }
    const avgCorroboration =
      predicateSourceMap.size > 0 ? totalCorroboration / predicateSourceMap.size : 0;

    // Recency: facts with a more recent recorded_from or last_seen_at
    // contribute more. Score decays from 1.0 (within last 7 days) to 0.3
    // (older than 90 days).
    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
    let recencyTotal = 0;
    for (const fact of facts) {
      const timestamp = fact.last_seen_at
        ? new Date(fact.last_seen_at).getTime()
        : fact.recorded_from
          ? new Date(fact.recorded_from).getTime()
          : 0;
      const age = now - timestamp;
      if (age <= SEVEN_DAYS) {
        recencyTotal += 1.0;
      } else if (age >= NINETY_DAYS) {
        recencyTotal += 0.3;
      } else {
        // Linear decay between 7 and 90 days.
        recencyTotal += 1.0 - 0.7 * ((age - SEVEN_DAYS) / (NINETY_DAYS - SEVEN_DAYS));
      }
    }
    const avgRecency = recencyTotal / facts.length;

    // Blend corroboration (60%) and recency (40%) into final score.
    const graphSupportScore = Math.min(1.0, avgCorroboration * 0.6 + avgRecency * 0.4);

    return { isAuthoritative, graphSupportScore };
  }

  private numericValue(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number(value.replace(/[^0-9.-]/g, ''));
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  /** Title-case a logical channel id, e.g. "channel-producthunt" -> "Producthunt". */
  private channelDisplayName(entityId: string): string {
    const raw = entityId.replace(/^channel-/, '');
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  /**
   * Blended CAC across the channels that have spend, computed as total spend
   * divided by total paid conversions (a spend-weighted average, not a mean of
   * per-channel CACs). Returns null when no channel has both spend and paid
   * conversions, so the caller can omit the figure rather than print a
   * misleading zero.
   */
  private blendedCac(rows: ChannelFunnelRow[]): number | null {
    let totalSpend = 0;
    let totalPaid = 0;
    for (const row of rows) {
      if (row.spend > 0 && row.paid > 0) {
        totalSpend += row.spend;
        totalPaid += row.paid;
      }
    }
    return totalPaid > 0 ? totalSpend / totalPaid : null;
  }

  /**
   * Derives a per-channel acquisition funnel from facts. Channel facts are
   * grouped by entity_id; the predicates signups/activated/paid/spend feed
   * activation rate, paid rate, cost-per-paid (CAC), and a composite quality
   * score. Rows are ranked by quality score descending so the highest-quality
   * channel leads, which is what makes "more signups != better campaign"
   * visible. Pure over the supplied facts; permission filtering happens before
   * facts reach this method.
   */
  public computeFunnel(facts: Fact[]): ChannelFunnelRow[] {
    const byChannel = new Map<string, Fact[]>();
    for (const fact of facts) {
      if (!fact.entity_id.startsWith('channel-')) continue;
      const group = byChannel.get(fact.entity_id);
      if (group) group.push(fact);
      else byChannel.set(fact.entity_id, [fact]);
    }

    // First pass: derive the raw funnel metrics per channel.
    const rows: ChannelFunnelRow[] = [];
    for (const [entityId, channelFacts] of byChannel) {
      const read = (predicate: string): number => {
        const match = channelFacts.find((fact) => fact.predicate === predicate);
        return match ? this.numericValue(match.value) : 0;
      };
      const signups = read('signups');
      const activated = read('activated');
      const paid = read('paid');
      const spend = read('spend');
      rows.push({
        channel: this.channelDisplayName(entityId),
        signups,
        activated,
        paid,
        spend,
        activationRate: signups > 0 ? activated / signups : 0,
        paidRate: signups > 0 ? paid / signups : 0,
        costPerPaid: paid > 0 && spend > 0 ? spend / paid : null,
        // qualityScore/rank are filled in below once the whole set is known.
        qualityScore: 0,
        rank: 0,
      });
    }

    this.assignQualityScores(rows);
    rows.sort((a, b) => b.qualityScore - a.qualityScore);
    rows.forEach((row, index) => {
      row.rank = index + 1;
    });
    return rows;
  }

  /**
   * Assigns a composite quality score (0..1) to each funnel row in place.
   *
   * Algorithmic decision: the score rewards conversion quality over raw signup
   * volume. It is a weighted sum of three components, with weights chosen to
   * prioritise revenue-proximate signals:
   *   - paidRate (weight 0.55): the strongest quality signal, since paid
   *     conversion is closest to revenue.
   *   - activationRate (weight 0.30): the next-best signal of engaged users.
   *   - cost efficiency (weight 0.15): cheaper acquisition (lower CAC) is
   *     better.
   *
   * The cost-efficiency component is normalized across the supplied set so it
   * is relative to the campaign's own channels rather than an arbitrary
   * absolute. Within the channels that have a CAC, the cheapest maps to 1.0 and
   * the most expensive to 0.0 (a single CAC-bearing channel maps to 1.0).
   * Channels with no recorded spend cannot be ranked on cost, so they receive a
   * neutral 0.5 cost component rather than being unfairly rewarded or punished.
   */
  private assignQualityScores(rows: ChannelFunnelRow[]): void {
    const PAID_WEIGHT = 0.55;
    const ACTIVATION_WEIGHT = 0.3;
    const COST_WEIGHT = 0.15;
    const NEUTRAL_COST = 0.5;

    const cacValues = rows
      .map((row) => row.costPerPaid)
      .filter((cac): cac is number => cac !== null);
    const minCac = cacValues.length > 0 ? Math.min(...cacValues) : 0;
    const maxCac = cacValues.length > 0 ? Math.max(...cacValues) : 0;
    const cacSpread = maxCac - minCac;

    for (const row of rows) {
      let costComponent: number;
      if (row.costPerPaid === null) {
        costComponent = NEUTRAL_COST;
      } else if (cacSpread === 0) {
        // All CAC-bearing channels share the same cost; none is comparatively
        // cheaper, so treat them as best-in-class on cost.
        costComponent = 1;
      } else {
        // Lower CAC -> higher component.
        costComponent = 1 - (row.costPerPaid - minCac) / cacSpread;
      }

      row.qualityScore =
        row.paidRate * PAID_WEIGHT +
        row.activationRate * ACTIVATION_WEIGHT +
        costComponent * COST_WEIGHT;
    }
  }

  private funnelSection(rows: ChannelFunnelRow[]): Section {
    if (rows.length === 0) {
      return {
        title: 'Channel Performance',
        content: 'No permission-visible cited channel funnel data is available.',
        type: 'alert',
        data: [],
      };
    }
    const pct = (value: number) => `${Math.round(value * 100)}%`;
    const lines = rows.map(
      (row) =>
        `#${row.rank} ${row.channel}: ${row.signups} signups -> ${row.activated} activated (${pct(
          row.activationRate,
        )}) -> ${row.paid} paid (${pct(row.paidRate)})` +
        (row.costPerPaid !== null ? `, $${Math.round(row.costPerPaid)} CAC` : ', no spend') +
        `, quality ${row.qualityScore.toFixed(2)}`,
    );
    return {
      title: 'Channel Performance',
      content: lines.join('\n'),
      type: 'table',
      data: rows,
    };
  }

  /**
   * Builds the themed 'User Response' section. Campaign facts whose predicate
   * starts with `user_response_` are grouped into labelled themes
   * (Positive / Confusion / Objection / Requests / Other) so a founder reads
   * qualitative signal by category rather than as a flat list. The section keeps
   * the exact title 'User Response'; it emits readable `content` plus structured
   * `data` (one entry per non-empty theme with its backing facts). Facts that do
   * not match the `user_response_` convention fall back to the legacy
   * insight/feedback selection so older ingested data still surfaces.
   */
  private userResponseSection(campaignFacts: Fact[]): Section {
    // Map each known suffix to its display label. The suffix is matched as a
    // prefix of the remainder so e.g. `user_response_requests` also lands under
    // Requests.
    const themeDefs: Array<{ label: string; match: (rest: string) => boolean }> = [
      { label: 'Positive', match: (rest) => rest.startsWith('positive') },
      { label: 'Confusion', match: (rest) => rest.startsWith('confusion') },
      { label: 'Objection', match: (rest) => rest.startsWith('objection') },
      { label: 'Requests', match: (rest) => rest.startsWith('request') },
    ];

    const themed = new Map<string, Fact[]>();
    const pushThemed = (label: string, fact: Fact) => {
      const group = themed.get(label);
      if (group) group.push(fact);
      else themed.set(label, [fact]);
    };

    const matchedIds = new Set<string>();
    for (const fact of campaignFacts) {
      const predicate = fact.predicate.toLowerCase();
      if (!predicate.startsWith('user_response_')) continue;
      const rest = predicate.slice('user_response_'.length);
      const def = themeDefs.find((d) => d.match(rest));
      pushThemed(def ? def.label : 'Other', fact);
      matchedIds.add(fact.id);
    }

    // Backward compatibility: surface legacy insight/feedback facts (and any
    // plain `user_response` predicate without a theme suffix) under Other so no
    // previously visible signal disappears.
    const legacy = this.selectFacts(campaignFacts, ['user_response', 'insight', 'feedback']).filter(
      (fact) => !matchedIds.has(fact.id),
    );
    for (const fact of legacy) pushThemed('Other', fact);

    // Stable, founder-readable ordering of themes.
    const order = ['Positive', 'Confusion', 'Objection', 'Requests', 'Other'];
    const themes = order
      .filter((label) => (themed.get(label)?.length ?? 0) > 0)
      .map((label) => ({ theme: label, facts: themed.get(label)! }));

    if (themes.length === 0) {
      return {
        title: 'User Response',
        content: 'No permission-visible cited user-response facts are available.',
        type: 'alert',
        data: [],
      };
    }

    const content = themes
      .map(
        ({ theme, facts }) =>
          `${theme}:\n${facts.map((fact) => `  - ${this.formatValue(fact.value)}`).join('\n')}`,
      )
      .join('\n');

    return {
      title: 'User Response',
      content,
      type: 'list',
      data: themes,
    };
  }

  /**
   * Returns the prior (superseded) and current values for a predicate, so a
   * brief can show how an understanding changed (e.g. an outdated report being
   * overtaken by funnel-grounded truth). Reads full history and selects the
   * latest superseded value plus the latest current value.
   */
  private async loadSupersededChange(
    tenantId: string,
    userId: string | undefined,
    entityId: string,
    predicate: string,
  ): Promise<{ previous: Fact | null; current: Fact | null }> {
    const history = this.filterVisibleFacts(
      await this.graphSvc.getFactsHistory(entityId, tenantId),
      tenantId,
      userId,
    ).filter((fact) => fact.predicate === predicate);
    const superseded = history
      .filter((fact) => fact.status === 'superseded')
      .sort((a, b) => (a.valid_from ?? '').localeCompare(b.valid_from ?? ''));
    const current = history.find((fact) => fact.status === 'current') ?? null;
    return { previous: superseded.at(-1) ?? null, current };
  }

  async generateCampaignBrief(
    tenantId: string,
    userId: string | undefined,
    input: { campaign: string },
  ): Promise<WorkflowOutput> {
    const { facts, conflicts } = await this.loadCurrentScopeFacts(tenantId, userId, [
      { type: 'Campaign', lookup: input.campaign },
    ]);
    return this.buildWorkflowOutput({
      workflowId: 'campaign_brief',
      tenantId,
      scope: `campaign:${input.campaign}`,
      facts,
      conflicts,
      sections: [
        this.factualSection('Campaign Overview', this.selectFacts(facts, ['goal', 'status', 'budget']), 'No permission-visible cited campaign overview is available.'),
        this.factualSection('Channel Signals', this.selectFacts(facts, ['channel']), 'No permission-visible cited channel signals are available.'),
        this.factualSection('User Response', this.selectFacts(facts, ['user_response', 'insight', 'feedback']), 'No permission-visible cited user-response facts are available.'),
        this.factualSection('Revenue Impact', this.selectFacts(facts, ['mrr', 'revenue', 'paid']), 'No permission-visible cited revenue facts are available.'),
        this.factualSection('Recommended Next Actions', this.selectFacts(facts, ['recommend', 'action', 'next']), 'No permission-visible cited recommendation is available; no action is suggested.'),
      ],
    });
  }

  async generateFeatureBrief(
    tenantId: string,
    userId: string | undefined,
    input: { feature: string },
  ): Promise<WorkflowOutput> {
    const { facts, conflicts } = await this.loadCurrentScopeFacts(tenantId, userId, [
      { type: 'Feature', lookup: input.feature },
    ]);
    return this.buildWorkflowOutput({
      workflowId: 'feature_brief',
      tenantId,
      scope: `feature:${input.feature}`,
      facts,
      conflicts,
      sections: [
        this.factualSection('Feature Performance', this.selectFacts(facts, ['exposure', 'activation', 'repeat', 'paid']), 'No permission-visible cited feature performance is available.'),
        this.factualSection('Best Segment', this.selectFacts(facts, ['segment']), 'No permission-visible cited segment fact is available.'),
        this.factualSection('Drop-off', this.selectFacts(facts, ['drop', 'churn']), 'No permission-visible cited drop-off fact is available.'),
      ],
    });
  }

  /**
   * Builds the prose Executive Summary. It quantifies "more signups does not
   * mean a better campaign" by explicitly contrasting the channel with the most
   * signups against the channel with the highest quality score, naming both and
   * citing their numbers. When the two are the same channel the framing is
   * adjusted to say volume and quality align. Blended CAC across spending
   * channels is appended when computable.
   */
  private buildGrowthSummary(funnel: ChannelFunnelRow[]): string {
    if (funnel.length === 0) {
      return 'Not enough permission-visible cited channel data to rank campaign quality.';
    }

    const pct = (value: number) => Math.round(value * 100);
    // funnel is already sorted by qualityScore desc, so the leader is index 0.
    const topQuality = funnel[0];
    const topSignups = [...funnel].sort((a, b) => b.signups - a.signups)[0];
    if (!topQuality || !topSignups) {
      return 'Not enough permission-visible cited channel data to rank campaign quality.';
    }

    let summary: string;
    if (topSignups.channel === topQuality.channel) {
      summary =
        `${topQuality.channel} leads on both volume (${topQuality.signups} signups) and quality ` +
        `(${pct(topQuality.paidRate)}% of signups convert to paid). Volume and quality align here, ` +
        `but keep ranking channels by activation and paid conversion rather than raw signups.`;
    } else {
      summary =
        `More signups does not mean a better campaign. ${topSignups.channel} has the most signups ` +
        `(${topSignups.signups}) yet only ${pct(topSignups.paidRate)}% convert to paid, while ` +
        `${topQuality.channel} drives the highest-quality users (${topQuality.signups} signups, ` +
        `${pct(topQuality.paidRate)}% paid conversion) and ranks #1 on quality. ` +
        `Rank channels by activation and paid conversion, not raw signups.`;
    }

    const blended = this.blendedCac(funnel);
    if (blended !== null) {
      summary += ` Blended CAC across channels with spend is about $${Math.round(blended)} per paid user.`;
    }
    return summary;
  }

  /**
   * Hero workflow: connects campaign performance, the per-channel funnel,
   * feature performance, user-response themes, what changed since the last
   * report, and recommended actions into one cited, permission-aware brief.
   */
  async generateFounderGrowthBrief(
    tenantId: string,
    userId: string | undefined,
    input: { campaign: string; feature?: string; channels?: string[] },
  ): Promise<WorkflowOutput> {
    const { facts: campaignFacts, conflicts } = await this.loadCurrentScopeFacts(tenantId, userId, [
      { type: 'Campaign', lookup: input.campaign },
    ]);

    const channelScopes = (input.channels ?? []).map((channel) => ({
      type: 'Channel' as ScopeEntityType,
      lookup: channel,
    }));
    const channelFacts =
      channelScopes.length > 0
        ? (await this.loadCurrentScopeFacts(tenantId, userId, channelScopes)).facts
        : [];

    const featureFacts = input.feature
      ? (await this.loadCurrentScopeFacts(tenantId, userId, [{ type: 'Feature', lookup: input.feature }])).facts
      : [];

    const funnel = this.computeFunnel(channelFacts);
    const verdictChange = await this.loadSupersededChange(
      tenantId,
      userId,
      input.campaign,
      'channel_verdict',
    );

    // All visible facts that back this brief, for citations and confidence.
    const allFacts = this.deduplicateFacts([...campaignFacts, ...channelFacts, ...featureFacts]);

    const reportChangeSection: Section =
      verdictChange.previous && verdictChange.current
        ? {
            title: 'What Changed Since the Last Report',
            content:
              `Previous (superseded): ${this.formatValue(verdictChange.previous.value)}\n` +
              `Current truth: ${this.formatValue(verdictChange.current.value)}`,
            type: 'key_value',
            data: verdictChange,
          }
        : {
            title: 'What Changed Since the Last Report',
            content: 'No permission-visible superseded report verdict was found for this campaign.',
            type: 'alert',
            data: [],
          };

    const summary = this.buildGrowthSummary(funnel);

    return this.buildWorkflowOutput({
      workflowId: 'founder_growth_brief',
      tenantId,
      scope: `campaign:${input.campaign}`,
      facts: allFacts,
      conflicts,
      sections: [
        { title: 'Executive Summary', content: summary, type: 'markdown' },
        this.funnelSection(funnel),
        this.factualSection('Feature Performance', this.selectFacts(featureFacts, ['exposure', 'activation', 'repeat', 'paid', 'segment', 'drop']), 'No permission-visible cited feature performance is available.'),
        this.userResponseSection(campaignFacts),
        this.factualSection('Revenue Impact', this.selectFacts(campaignFacts, ['mrr', 'revenue']), 'No permission-visible cited revenue facts are available to this identity.'),
        reportChangeSection,
        this.factualSection('Recommended Next Actions', this.selectFacts(campaignFacts, ['recommend', 'action', 'next']), 'No permission-visible cited recommendation is available; no action is suggested.'),
      ],
    });
  }

  async generateOnboardingBrief(
    tenantId: string,
    userId: string | undefined,
    input: { user: string; team: string; role: string },
  ): Promise<WorkflowOutput> {
    const { facts, conflicts } = await this.loadCurrentScopeFacts(tenantId, userId, [
      { type: 'Team', lookup: input.team },
    ]);
    const people = this.selectFacts(facts, ['person', 'member', 'owner', 'contact']);
    const projects = this.selectFacts(facts, ['project', 'initiative', 'roadmap']);
    const decisions = this.selectFacts(facts, ['decision']);

    return this.buildWorkflowOutput({
      workflowId: 'onboarding_brief',
      tenantId,
      scope: `team:${input.team}`,
      facts,
      conflicts,
      sections: [
        this.factualSection(
          'Team Overview',
          facts,
          'No permission-visible cited team overview is available.',
        ),
        this.factualSection(
          'Key People',
          people,
          'No permission-visible cited team-member facts are available.',
        ),
        this.factualSection(
          'Active Projects',
          projects,
          'No permission-visible cited project facts are available.',
        ),
        this.factualSection(
          'Recent Decisions',
          decisions,
          'No permission-visible cited decision facts are available.',
        ),
        {
          title: 'First-week Reading Plan',
          content: `Suggested plan for ${input.user}: review the cited ${input.team} evidence above, confirm access gaps, and schedule role-specific introductions for ${input.role}.`,
          type: 'markdown',
        },
      ],
    });
  }

  async generateWeeklyDigest(
    tenantId: string,
    userId: string | undefined,
    input: { team: string; dateRange: { from: string; to: string } },
  ): Promise<WorkflowOutput> {
    const { facts, conflicts } = await this.loadChangedScopeFacts(
      tenantId,
      userId,
      { type: 'Team', lookup: input.team },
      input.dateRange.from,
      input.dateRange.to,
    );

    return this.buildWorkflowOutput({
      workflowId: 'weekly_digest',
      tenantId,
      scope: `team:${input.team}`,
      facts,
      conflicts,
      sections: [
        this.factualSection(
          'What Changed',
          facts,
          'No permission-visible cited changes were found in this date range.',
        ),
        this.factualSection(
          'Decisions Made',
          this.selectFacts(facts, ['decision']),
          'No permission-visible cited decisions were found in this date range.',
        ),
        this.factualSection(
          'Open Risks',
          this.selectFacts(facts, ['risk', 'blocker', 'incident', 'conflict', 'issue']),
          'No permission-visible cited risks were found in this date range.',
        ),
      ],
    });
  }

  async generateIncidentBrief(
    tenantId: string,
    userId: string | undefined,
    input: { incidentId: string; service: string },
  ): Promise<WorkflowOutput> {
    const { facts, conflicts } = await this.loadCurrentScopeFacts(tenantId, userId, [
      { type: 'Incident', lookup: input.incidentId },
      { type: 'Service', lookup: input.service },
    ]);

    return this.buildWorkflowOutput({
      workflowId: 'incident_brief',
      tenantId,
      scope: `service:${input.service}`,
      facts,
      conflicts,
      sections: [
        this.factualSection(
          'Incident Summary',
          facts,
          'No permission-visible cited incident summary is available.',
        ),
        this.factualSection(
          'Timeline',
          this.selectFacts(facts, ['time', 'detected', 'resolved', 'timeline']),
          'No permission-visible cited timeline is available.',
        ),
        this.factualSection(
          'Root Cause',
          this.selectFacts(facts, ['cause', 'root']),
          'No permission-visible cited root cause is available.',
        ),
        this.factualSection(
          'Open Follow-ups',
          this.selectFacts(facts, ['follow', 'action', 'task', 'remediation']),
          'No permission-visible cited follow-ups are available.',
        ),
      ],
    });
  }

  async generateMeetingPrep(
    tenantId: string,
    userId: string | undefined,
    input: { eventTitle: string; attendees: string[] },
  ): Promise<WorkflowOutput> {
    const { facts, conflicts } = await this.loadCurrentScopeFacts(tenantId, userId, [
      { type: 'Meeting', lookup: input.eventTitle },
    ]);
    const attendeeFacts = this.selectFacts(facts, ['attendee', 'participant', 'person']);

    return this.buildWorkflowOutput({
      workflowId: 'meeting_prep',
      tenantId,
      scope: 'personal',
      facts,
      conflicts,
      sections: [
        this.factualSection(
          'Available Cited Context',
          facts,
          'No permission-visible cited meeting context is available.',
        ),
        this.factualSection(
          'Meeting Goal',
          this.selectFacts(facts, ['goal', 'agenda', 'purpose']),
          `No permission-visible cited goal is available for the requested meeting "${input.eventTitle}".`,
        ),
        attendeeFacts.length > 0
          ? this.factualSection('Attendees Context', attendeeFacts, '')
          : {
              title: 'Attendees Context',
              content: `Requested attendees supplied by the caller: ${input.attendees.join(', ') || 'none'}. No permission-visible cited attendee context is available.`,
              type: 'alert',
              data: [],
            },
        this.factualSection(
          'Open Action Items',
          this.selectFacts(facts, ['action', 'task', 'follow', 'owner']),
          'No permission-visible cited action items are available.',
        ),
      ],
    });
  }

  async generateAccountSummary(
    tenantId: string,
    userId: string | undefined,
    input: { accountName: string },
  ): Promise<WorkflowOutput> {
    const { facts, conflicts } = await this.loadCurrentScopeFacts(tenantId, userId, [
      { type: 'Account', lookup: input.accountName },
    ]);

    return this.buildWorkflowOutput({
      workflowId: 'account_summary',
      tenantId,
      scope: `account:${input.accountName}`,
      facts,
      conflicts,
      sections: [
        this.factualSection(
          'Account Health',
          this.selectFacts(facts, ['health', 'status', 'active']),
          'No permission-visible cited account-health facts are available.',
        ),
        this.factualSection(
          'Renewal Risks',
          this.selectFacts(facts, ['risk', 'renewal', 'blocker', 'issue']),
          'No permission-visible cited renewal-risk facts are available.',
        ),
        this.factualSection(
          'Recommended Next Step',
          this.selectFacts(facts, ['next', 'recommend', 'follow', 'action']),
          'No permission-visible cited next-step facts are available; no recommendation is made.',
        ),
      ],
    });
  }

  /**
   * General answering/retrieval pipeline with citation validation and
   * low-confidence abstention.
   */
  async retrieveAndAnswer(
    tenantId: string,
    query: string,
    projectId: string,
    userId?: string,
  ): Promise<{ answer: string; confidence: number; level: string; citations: Citation[] }> {
    const facts = this.filterVisibleFacts(
      await this.graphSvc.getFactsCurrent(projectId, tenantId),
      tenantId,
      userId,
    );
    const conflicts = this.filterVisibleFacts(
      await this.graphSvc.getFactsConflicts(projectId, tenantId),
      tenantId,
      userId,
    );

    if (conflicts.length > 0) {
      return {
        answer: `I found permission-visible conflicting sources: ${conflicts
          .map((conflict) => this.formatFact(conflict))
          .join(' vs ')}.`,
        confidence: 0.1,
        level: 'abstain',
        citations: this.createCitations(conflicts),
      };
    }

    const citations = this.createCitations(facts);
    const graphSupport = this.calculateGraphSupport(facts);
    const calibration = this.calibrateConfidence({
      sourcesCount: new Set(citations.map((citation) => citation.source_id)).size,
      hasContradictions: false,
      hasCurrentFact: facts.length > 0,
      isAuthoritative: graphSupport.isAuthoritative,
      graphSupportScore: graphSupport.graphSupportScore,
    });

    let answer = facts.length > 0 
      ? `For "${query}", the permission-visible cited evidence says: ${facts.map((fact) => this.formatFact(fact)).join(', ')}.`
      : 'I found related information, but not enough evidence visible to this caller to answer confidently.';

    let usedOpenAi = false;
    if (this.connectionDAO || process.env.OPENAI_API_KEY) {
      try {
        let apiKey = process.env.OPENAI_API_KEY;
        if (this.connectionDAO) {
          const openaiConn = await this.connectionDAO.getByProvider('openai');
          if (openaiConn?.config?.apiKey) {
            apiKey = openaiConn.config.apiKey as string;
          }
        }
        if (apiKey) {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: [
                {
                  role: 'system',
                  content: 'You are an intelligent AI assistant in Agent Mesh. If facts are provided, answer based on them. Otherwise, answer to the best of your knowledge.',
                },
                {
                  role: 'user',
                  content: facts.length > 0 
                    ? `Facts:\n${facts.map((fact) => this.formatFact(fact)).join('\n')}\n\nQuery: ${query}`
                    : `Query: ${query}`,
                },
              ],
            }),
          });
          if (response.ok) {
            const data = (await response.json()) as any;
            const aiAnswer = data?.choices?.[0]?.message?.content;
            if (aiAnswer) {
              answer = aiAnswer;
              usedOpenAi = true;
            }
          } else {
            console.error('[TrustWorkflowService] OpenAI API failed:', await response.text());
          }
        }
      } catch (err) {
        console.error('[TrustWorkflowService] Failed to call OpenAI API:', err);
      }
    }

    if (facts.length === 0 && !usedOpenAi) {
      return {
        answer,
        confidence: 0.15,
        level: 'abstain',
        citations: [],
      };
    }

    return {
      answer,
      confidence: calibration.score,
      level: calibration.level,
      citations,
    };
  }

  /**
   * Streaming variant of {@link retrieveAndAnswer}. Yields a `meta` event with
   * the resolved citations as soon as the permission-filtered evidence is known,
   * then `token` events as the answer is generated, then a final `done` event
   * carrying the authoritative confidence/level. Abstention (conflicts or no
   * permitted evidence) is emitted as a single token plus a `done` so the client
   * renders it identically to the non-streaming path.
   *
   * The retrieval/calibration logic mirrors {@link retrieveAndAnswer} exactly;
   * only the LLM call streams (`stream: true`). When no API key is configured
   * the deterministic, evidence-derived answer is emitted in one chunk.
   */
  async *streamRetrieveAndAnswer(
    tenantId: string,
    query: string,
    projectId: string,
    userId?: string,
    signal?: AbortSignal,
  ): AsyncGenerator<AnswerStreamEvent> {
    const facts = this.filterVisibleFacts(
      await this.graphSvc.getFactsCurrent(projectId, tenantId),
      tenantId,
      userId,
    );
    const conflicts = this.filterVisibleFacts(
      await this.graphSvc.getFactsConflicts(projectId, tenantId),
      tenantId,
      userId,
    );

    if (conflicts.length > 0) {
      const citations = this.createCitations(conflicts);
      const answer = `I found permission-visible conflicting sources: ${conflicts
        .map((conflict) => this.formatFact(conflict))
        .join(' vs ')}.`;
      yield { type: 'meta', citations };
      yield { type: 'token', text: answer };
      yield { type: 'done', answer, confidence: 0.1, level: 'abstain', citations };
      return;
    }

    const citations = this.createCitations(facts);
    const graphSupport = this.calculateGraphSupport(facts);
    const calibration = this.calibrateConfidence({
      sourcesCount: new Set(citations.map((citation) => citation.source_id)).size,
      hasContradictions: false,
      hasCurrentFact: facts.length > 0,
      isAuthoritative: graphSupport.isAuthoritative,
      graphSupportScore: graphSupport.graphSupportScore,
    });

    yield { type: 'meta', citations };

    const deterministic =
      facts.length > 0
        ? `For "${query}", the permission-visible cited evidence says: ${facts
            .map((fact) => this.formatFact(fact))
            .join(', ')}.`
        : 'I found related information, but not enough evidence visible to this caller to answer confidently.';

    let streamedText = '';
    let usedOpenAi = false;
    const apiKey = await this.resolveOpenAiKey();
    if (apiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            stream: true,
            messages: [
              {
                role: 'system',
                content:
                  'You are an intelligent AI assistant in Agent Mesh. If facts are provided, answer based on them. Otherwise, answer to the best of your knowledge.',
              },
              {
                role: 'user',
                content:
                  facts.length > 0
                    ? `Facts:\n${facts.map((fact) => this.formatFact(fact)).join('\n')}\n\nQuery: ${query}`
                    : `Query: ${query}`,
              },
            ],
          }),
          signal,
        });
        if (response.ok && response.body) {
          for await (const delta of this.parseOpenAiStream(response.body)) {
            if (signal?.aborted) return;
            streamedText += delta;
            usedOpenAi = true;
            yield { type: 'token', text: delta };
          }
        } else if (!response.ok) {
          console.error('[TrustWorkflowService] OpenAI stream failed:', await response.text());
        }
      } catch (err) {
        if (signal?.aborted) return;
        console.error('[TrustWorkflowService] OpenAI stream error:', err);
      }
    }

    if (signal?.aborted) return;

    if (!usedOpenAi) {
      // No streamed tokens — emit the deterministic, evidence-derived answer in
      // one chunk. With zero permitted facts this is a clean abstention.
      yield { type: 'token', text: deterministic };
      if (facts.length === 0) {
        yield { type: 'done', answer: deterministic, confidence: 0.15, level: 'abstain', citations: [] };
        return;
      }
    }

    const answer = usedOpenAi ? streamedText : deterministic;
    yield {
      type: 'done',
      answer,
      confidence: calibration.score,
      level: calibration.level,
      citations,
    };
  }

  /** Resolve the OpenAI key from a stored connection, else the environment. */
  private async resolveOpenAiKey(): Promise<string | undefined> {
    let apiKey = process.env.OPENAI_API_KEY;
    if (this.connectionDAO) {
      try {
        const openaiConn = await this.connectionDAO.getByProvider('openai');
        if (openaiConn?.config?.apiKey) {
          apiKey = openaiConn.config.apiKey as string;
        }
      } catch {
        /* fall back to the environment key */
      }
    }
    return apiKey;
  }

  /**
   * Parse an OpenAI Chat Completions SSE stream, yielding only the incremental
   * `delta.content` text. Tolerates chunk boundaries that split SSE lines.
   */
  private async *parseOpenAiStream(
    body: ReadableStream<Uint8Array> | NodeJS.ReadableStream,
  ): AsyncGenerator<string> {
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          /* ignore partial/keep-alive lines */
        }
      }
    }
  }
}

/** One frame of a streamed answer, serialized as an SSE `data:` line. */
export type AnswerStreamEvent =
  | { type: 'meta'; citations: Citation[] }
  | { type: 'token'; text: string }
  | { type: 'done'; answer: string; confidence: number; level: string; citations: Citation[] }
  | { type: 'error'; message: string };

export const trustWorkflowService = new TrustWorkflowService();
