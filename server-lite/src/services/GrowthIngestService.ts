/**
 * Growth Memory "bring your own data" ingestion service.
 *
 * Writes a founder's own campaign/channel/feature/feedback data into the graph
 * using EXACTLY the same node + temporal-fact conventions as
 * {@link runGrowthDemoSeed} (see demoGrowthSeed.ts), so the existing
 * permission-aware, cited founder-growth brief reads ingested data with zero
 * brief-side changes.
 *
 * Security notes:
 *  - tenant_id is supplied by the controller from the verified request.user
 *    identity only. This service never derives tenant/user from request body.
 *  - Fail-closed ACL: every fact references a source GraphNode that is
 *    registered (via graphService.ingestNode) BEFORE any fact is ingested.
 *    Facts whose source was never registered are invisible to retrieval, so we
 *    must register the source first or the brief silently drops the data.
 *  - Sources here are registered as public (permissions_hash: null) because
 *    bring-your-own founder data is owned by the ingesting tenant; tenant
 *    scoping alone gates visibility. Restricted (ACL-gated) sources remain a
 *    seed/demo concern.
 */
import crypto from 'node:crypto';
import { graphService, type Fact, type GraphNode } from '@agentmesh/graph-service';

export interface GrowthIngestRequest {
  campaign: {
    id?: string;
    name: string;
    goal?: string;
    status?: string;
    recommended_action?: string;
  };
  channels: Array<{
    slug: string;
    signups: number;
    activated: number;
    paid: number;
    spend?: number;
  }>;
  feature?: {
    id?: string;
    name: string;
    exposure?: number;
    activation?: number;
    repeat_usage?: number;
    paid_influence?: number;
    best_segment?: string;
    drop_off?: string;
  };
  feedback?: Array<{ text: string; theme?: string }>;
  reportVerdict?: { previous?: string; current?: string };
}

export interface GrowthIngestResult {
  campaign: string;
  channels: string[];
  feature?: string;
  facts_ingested: number;
}

/** lowercase, non-alphanumerics -> '-', trim leading/trailing dashes. */
function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export class GrowthIngestService {
  /**
   * Ingest a founder's growth dataset under the given verified tenant.
   *
   * @param tenantId verified tenant id from request.user (never from body)
   * @param userId   verified user id from request.user, recorded for audit only
   *                 (may be undefined if the principal carries no user id)
   */
  async ingest(
    tenantId: string,
    userId: string | undefined,
    body: GrowthIngestRequest,
  ): Promise<GrowthIngestResult> {
    const now = new Date().toISOString();
    const recent = (daysAgo: number) =>
      new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

    const campaignId = body.campaign.id ?? `campaign-${slug(body.campaign.name)}`;
    const featureId = body.feature
      ? body.feature.id ?? `feature-${slug(body.feature.name)}`
      : undefined;

    // One logical source per data kind for this campaign. Registered up front so
    // every fact below has a visible source (fail-closed: unregistered source =>
    // invisible fact).
    const sourceId = `src-byo-${campaignId}`;

    // Audit breadcrumb: who ingested this dataset (verified identity only).
    const ingestEvidence = `Bring-your-own ingestion by ${userId ?? 'unknown'} on ${now}.`;

    const sourceNode = (
      type: GraphNode['type'],
      name: string,
    ): GraphNode => ({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      type,
      canonical_name: name,
      aliases: [],
      source_system: 'byo',
      source_id: sourceId,
      confidence: 0.85,
      status: 'current',
      created_at: now,
      updated_at: now,
      valid_from: recent(30),
      valid_to: null,
      recorded_from: recent(30),
      recorded_to: null,
      last_seen_at: now,
      // null = public; tenant scoping alone gates visibility for own data.
      permissions_hash: null,
      source_url: null,
      properties: {},
    });

    const makeFact = (args: {
      entityId: string;
      predicate: string;
      value: unknown;
      validFrom: string;
      evidence: string;
    }): Fact => ({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      entity_id: args.entityId,
      predicate: args.predicate,
      value: args.value,
      confidence: 0.85,
      status: 'current',
      valid_from: args.validFrom,
      valid_to: null,
      recorded_from: args.validFrom,
      recorded_to: null,
      source_id: sourceId,
      evidence_spans: [args.evidence],
      last_seen_at: now,
    });

    // --- Register source ACL BEFORE ingesting any fact (fail-closed). ---
    await graphService.ingestNode(sourceNode('Insight', `Bring-your-own growth data: ${body.campaign.name}`));

    const facts: Fact[] = [];

    // --- Campaign-scoped facts ---
    if (body.campaign.goal) {
      facts.push(
        makeFact({
          entityId: campaignId,
          predicate: 'goal',
          value: body.campaign.goal,
          validFrom: recent(14),
          evidence: `Campaign goal: ${body.campaign.goal}`,
        }),
      );
    }
    if (body.campaign.status) {
      facts.push(
        makeFact({
          entityId: campaignId,
          predicate: 'status',
          value: body.campaign.status,
          validFrom: recent(7),
          evidence: `Campaign status: ${body.campaign.status}`,
        }),
      );
    }
    if (body.campaign.recommended_action) {
      facts.push(
        makeFact({
          entityId: campaignId,
          predicate: 'recommended_action',
          value: body.campaign.recommended_action,
          validFrom: recent(2),
          evidence: `Recommended action: ${body.campaign.recommended_action}`,
        }),
      );
    }

    // --- Channels: campaign-scoped summary + per-channel numeric facts ---
    const channelIds: string[] = [];
    for (const channel of body.channels) {
      const channelSlug = slug(channel.slug);
      const channelId = `channel-${channelSlug}`;
      channelIds.push(channelId);

      const activationRate =
        channel.signups > 0
          ? Math.round((channel.activated / channel.signups) * 100)
          : 0;

      // Campaign-scoped summary string (predicate channel_<slug>) so a single
      // campaign-scope query surfaces the funnel as cited evidence.
      facts.push(
        makeFact({
          entityId: campaignId,
          predicate: `channel_${channelSlug}`,
          value: `${channel.signups} signups -> ${channel.activated} activated (${activationRate}%) -> ${channel.paid} paid`,
          validFrom: recent(5),
          evidence: `${channel.slug}: ${channel.signups} signups, ${channel.activated} activated, ${channel.paid} paid.`,
        }),
      );

      // Per-channel structured numeric facts (drive funnel analytics).
      facts.push(
        makeFact({
          entityId: channelId,
          predicate: 'signups',
          value: channel.signups,
          validFrom: recent(5),
          evidence: `${channel.slug}: ${channel.signups} signups.`,
        }),
        makeFact({
          entityId: channelId,
          predicate: 'activated',
          value: channel.activated,
          validFrom: recent(5),
          evidence: `${channel.slug}: ${channel.activated} activated.`,
        }),
        makeFact({
          entityId: channelId,
          predicate: 'paid',
          value: channel.paid,
          validFrom: recent(5),
          evidence: `${channel.slug}: ${channel.paid} paid.`,
        }),
      );
      if (typeof channel.spend === 'number') {
        facts.push(
          makeFact({
            entityId: channelId,
            predicate: 'spend',
            value: channel.spend,
            validFrom: recent(5),
            evidence: `${channel.slug}: ${channel.spend} spend.`,
          }),
        );
      }
    }

    // --- Feedback: campaign-scoped user_response_<theme> facts ---
    for (const item of body.feedback ?? []) {
      const theme = item.theme && item.theme.trim().length > 0 ? slug(item.theme) : 'note';
      facts.push(
        makeFact({
          entityId: campaignId,
          predicate: `user_response_${theme}`,
          value: item.text,
          validFrom: recent(4),
          evidence: `User feedback (${theme}): ${item.text}`,
        }),
      );
    }

    // --- Feature-scoped facts ---
    if (body.feature && featureId) {
      const f = body.feature;
      const featureFact = (predicate: string, value: unknown, label: string) =>
        facts.push(
          makeFact({
            entityId: featureId,
            predicate,
            value,
            validFrom: recent(5),
            evidence: `${f.name} ${label}: ${String(value)}`,
          }),
        );
      if (typeof f.exposure === 'number') featureFact('exposure', f.exposure, 'exposure');
      if (typeof f.activation === 'number') featureFact('activation', f.activation, 'activation');
      if (typeof f.repeat_usage === 'number') featureFact('repeat_usage', f.repeat_usage, 'repeat usage');
      if (typeof f.paid_influence === 'number') featureFact('paid_influence', f.paid_influence, 'paid influence');
      if (f.best_segment) featureFact('best_segment', f.best_segment, 'best segment');
      if (f.drop_off) featureFact('drop_off', f.drop_off, 'drop-off');
    }

    // Ingest all single-version facts.
    for (const fact of facts) {
      await graphService.ingestFact(fact);
    }
    let factsIngested = facts.length;

    // --- Temporal supersession: previous verdict (older) then current (newer) ---
    // Ingesting an older channel_verdict followed by a newer one lets the real
    // SupersessionDetectionJob mark the old one superseded, demonstrating the
    // temporal moat on the founder's own data.
    if (
      body.reportVerdict?.previous &&
      body.reportVerdict?.current &&
      body.reportVerdict.previous.trim().length > 0 &&
      body.reportVerdict.current.trim().length > 0
    ) {
      await graphService.ingestFact(
        makeFact({
          entityId: campaignId,
          predicate: 'channel_verdict',
          value: body.reportVerdict.previous,
          validFrom: recent(10),
          evidence: `Prior verdict: ${body.reportVerdict.previous}`,
        }),
      );
      await graphService.ingestFact(
        makeFact({
          entityId: campaignId,
          predicate: 'channel_verdict',
          value: body.reportVerdict.current,
          validFrom: now,
          evidence: `Updated verdict: ${body.reportVerdict.current}`,
        }),
      );
      factsIngested += 2;
    }

    // eslint-disable-next-line no-console
    console.log(
      `[GrowthIngest] tenant=${tenantId} campaign=${campaignId} ` +
        `channels=${channelIds.length} facts=${factsIngested}. ${ingestEvidence}`,
    );

    return {
      campaign: campaignId,
      channels: channelIds,
      feature: featureId,
      facts_ingested: factsIngested,
    };
  }
}

export const growthIngestService = new GrowthIngestService();
