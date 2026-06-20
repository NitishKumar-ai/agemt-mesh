import {
  Fact,
  graphService,
  GraphService,
  policyEngine,
  PolicyEngine,
} from '@agentmesh/graph-service';
import { WorkflowOutput, Section, Citation } from '../domain/types.js';
import crypto from 'node:crypto';

type ScopeEntityType = 'Team' | 'Incident' | 'Service' | 'Meeting' | 'Account';

interface VisibleScopeFacts {
  facts: Fact[];
  conflicts: Fact[];
}

export class TrustWorkflowService {
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

    if (facts.length === 0) {
      return {
        answer:
          'I found related information, but not enough evidence visible to this caller to answer confidently.',
        confidence: 0.15,
        level: 'abstain',
        citations: [],
      };
    }

    const citations = this.createCitations(facts);
    const graphSupport = this.calculateGraphSupport(facts);
    const calibration = this.calibrateConfidence({
      sourcesCount: new Set(citations.map((citation) => citation.source_id)).size,
      hasContradictions: false,
      hasCurrentFact: true,
      isAuthoritative: graphSupport.isAuthoritative,
      graphSupportScore: graphSupport.graphSupportScore,
    });

    return {
      answer: `For "${query}", the permission-visible cited evidence says: ${facts
        .map((fact) => this.formatFact(fact))
        .join(', ')}.`,
      confidence: calibration.score,
      level: calibration.level,
      citations,
    };
  }
}

export const trustWorkflowService = new TrustWorkflowService();
