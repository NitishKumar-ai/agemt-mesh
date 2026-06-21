/**
 * Growth Memory demo seed (additive domain pack).
 *
 * Layers a startup "Growth Memory" dataset on top of the same demo tenant and
 * ACL principals used by {@link runDemoSeed}. It models one real founder scenario —
 * Atlas AI's "Founder Productivity Campaign" promoting the Weekly Investor
 * Update feature across four channels — so the existing permission-aware,
 * cited Ask/brief pipeline answers the hero question:
 *
 *   "How did the Founder Productivity Campaign perform, and what should we do next?"
 *
 * The dataset is deliberately built to exercise three engine capabilities the
 * product story depends on, with zero new engine code:
 *
 *  1. Cross-source funnel truth: per-channel signups/activated/paid facts show
 *     that more signups (Product Hunt) does not mean a better campaign
 *     (LinkedIn/Email convert far better).
 *  2. Temporal supersession: an older Notion report verdict ("Product Hunt is
 *     the winning channel") is automatically superseded by a newer, funnel-
 *     grounded verdict via the real SupersessionDetectionJob.
 *  3. Permission-awareness: the revenue (MRR) fact is sales-restricted, so only
 *     admin/sales principals see it — the same fail-closed ACL path as the
 *     company-brain demo.
 *
 * All facts are keyed by stable logical entity ids (campaign-/feature-/channel-)
 * exactly like the project-atlas scope in demoSeed, so the existing Ask page
 * answers immediately when scoped to "campaign-founder-productivity".
 */
import crypto from 'node:crypto';
import { graphService, policyEngine, type Fact, type GraphNode } from '@agentmesh/graph-service';
import { DEMO_TENANT, DEMO_PRINCIPALS, DEMO_USER } from './demoSeed.js';

// Logical scope ids (mirrors the project-atlas pattern in demoSeed). These are
// the fact entity_ids the Ask page / brief workflows resolve against.
export const GROWTH_CAMPAIGN_ID = 'campaign-founder-productivity';
export const GROWTH_FEATURE_ID = 'feature-investor-update';
export const GROWTH_CHANNEL_IDS = [
  'channel-producthunt',
  'channel-linkedin',
  'channel-email',
  'channel-twitter',
] as const;

// Same ACL label demoSeed grants to admin + sales identities, so the restricted
// revenue fact is visible to Priya (admin) and Dana (sales) but not others.
const SALES_ACL = 'confidential-sales';

const now = new Date().toISOString();
const recent = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

function sourceNode(
  sourceId: string,
  type: GraphNode['type'],
  name: string,
  permissionsHash: string | null,
): GraphNode {
  return {
    id: crypto.randomUUID(),
    tenant_id: DEMO_TENANT,
    type,
    canonical_name: name,
    aliases: [],
    source_system: sourceId.split('-')[1] ?? 'connector',
    source_id: sourceId,
    confidence: 0.95,
    status: 'current',
    created_at: now,
    updated_at: now,
    valid_from: recent(30),
    valid_to: null,
    recorded_from: recent(30),
    recorded_to: null,
    last_seen_at: now,
    permissions_hash: permissionsHash, // null = public; label = ACL-gated
    source_url: null,
    properties: {},
  };
}

function fact(args: {
  entityId: string;
  predicate: string;
  value: unknown;
  sourceId: string;
  confidence: number;
  validFrom: string;
  evidence: string;
}): Fact {
  return {
    id: crypto.randomUUID(),
    tenant_id: DEMO_TENANT,
    entity_id: args.entityId,
    predicate: args.predicate,
    value: args.value,
    confidence: args.confidence,
    status: 'current',
    valid_from: args.validFrom,
    valid_to: null,
    recorded_from: args.validFrom,
    recorded_to: null,
    source_id: args.sourceId,
    evidence_spans: [args.evidence],
    last_seen_at: now,
  };
}

/** Per-channel funnel numbers driving the "more signups != better" insight. */
const CHANNELS: Array<{
  id: string;
  name: string;
  source: string;
  signups: number;
  activated: number;
  paid: number;
  spend: number;
}> = [
  { id: 'channel-producthunt', name: 'Product Hunt', source: 'src-ph-comments', signups: 900, activated: 60, paid: 2, spend: 0 },
  { id: 'channel-linkedin', name: 'LinkedIn', source: 'src-ads-linkedin', signups: 300, activated: 120, paid: 12, spend: 4200 },
  { id: 'channel-email', name: 'Email', source: 'src-email-campaign', signups: 150, activated: 80, paid: 8, spend: 600 },
  { id: 'channel-twitter', name: 'Twitter', source: 'src-ads-twitter', signups: 500, activated: 40, paid: 1, spend: 1800 },
];

/**
 * Seed the Growth Memory demo dataset. Idempotent at the graph layer (nodes
 * upsert by id/source_id) and safe to call after runDemoSeed.
 */
export async function runGrowthDemoSeed(): Promise<void> {
  // Ensure the representative principals can resolve access even if this seed runs alone.
  // grantAccess overwrites the same key, so re-granting is harmless.
  policyEngine.grantAccess({
    tenant_id: DEMO_TENANT,
    user_id: DEMO_USER,
    permission_hashes: [],
    is_admin: true,
  });
  for (const identity of DEMO_PRINCIPALS) {
    policyEngine.grantAccess({
      tenant_id: DEMO_TENANT,
      user_id: identity.key,
      permission_hashes: identity.permissionHashes,
      is_admin: identity.isAdmin,
    });
  }

  // --- Sources (register ACLs; null = public, label = restricted) ---
  const sources: GraphNode[] = [
    sourceNode('src-ads-linkedin', 'Channel', 'LinkedIn Ads export (CSV)', null),
    sourceNode('src-ads-twitter', 'Channel', 'Twitter Ads export (CSV)', null),
    sourceNode('src-ph-comments', 'Channel', 'Product Hunt launch + comments', null),
    sourceNode('src-email-campaign', 'Channel', 'Email campaign report', null),
    sourceNode('src-posthog', 'Document', 'PostHog product analytics export', null),
    sourceNode('src-intercom', 'Message', 'Intercom user conversations', null),
    sourceNode('src-notion-growth-report', 'Report', 'Notion growth report (week 1)', null),
    sourceNode('src-funnel-derived', 'Insight', 'AgentMesh funnel analysis', null),
    sourceNode('src-stripe', 'Payment', 'Stripe revenue export', SALES_ACL),
  ];
  for (const node of sources) {
    await graphService.ingestNode(node);
  }

  // --- Campaign-scoped facts (what the Ask page shows for the hero scope) ---
  const campaignFacts: Fact[] = [
    fact({
      entityId: GROWTH_CAMPAIGN_ID,
      predicate: 'goal',
      value: 'Get 100 startup teams to activate the Weekly Investor Update feature',
      sourceId: 'src-notion-growth-report',
      confidence: 0.92,
      validFrom: recent(14),
      evidence: 'Campaign brief: activate 100 founder teams on the Weekly Investor Update feature.',
    }),
    fact({
      entityId: GROWTH_CAMPAIGN_ID,
      predicate: 'status',
      value: 'Running across LinkedIn, Product Hunt, Email, and Twitter',
      sourceId: 'src-notion-growth-report',
      confidence: 0.9,
      validFrom: recent(7),
      evidence: 'Campaign is live on four channels with a $6.6K combined spend.',
    }),
  ];

  // Per-channel funnel summary facts, scoped to the campaign so a single-scope
  // Ask query surfaces the full funnel as cited evidence.
  for (const channel of CHANNELS) {
    const activationRate = Math.round((channel.activated / channel.signups) * 100);
    campaignFacts.push(
      fact({
        entityId: GROWTH_CAMPAIGN_ID,
        predicate: `channel_${channel.id.replace('channel-', '')}`,
        value: `${channel.signups} signups -> ${channel.activated} activated (${activationRate}%) -> ${channel.paid} paid`,
        sourceId: channel.source,
        confidence: 0.9,
        validFrom: recent(5),
        evidence: `${channel.name}: ${channel.signups} signups, ${channel.activated} activated, ${channel.paid} paid.`,
      }),
    );
  }

  // User-response intelligence (classified feedback themes).
  campaignFacts.push(
    fact({
      entityId: GROWTH_CAMPAIGN_ID,
      predicate: 'user_response_positive',
      value: 'Founders say it saves ~2 hours every Friday on investor updates',
      sourceId: 'src-intercom',
      confidence: 0.85,
      validFrom: recent(4),
      evidence: 'Intercom: "This saves me 2 hours every Friday."',
    }),
    fact({
      entityId: GROWTH_CAMPAIGN_ID,
      predicate: 'user_response_confusion',
      value: 'Users are confused about connecting Slack and Notion during setup',
      sourceId: 'src-intercom',
      confidence: 0.83,
      validFrom: recent(4),
      evidence: 'Intercom: "How do I connect Notion and Slack?"',
    }),
    fact({
      entityId: GROWTH_CAMPAIGN_ID,
      predicate: 'user_response_objection',
      value: 'Security and data permissions are the top objection from larger teams',
      sourceId: 'src-intercom',
      confidence: 0.82,
      validFrom: recent(3),
      evidence: 'Intercom: "Is our internal data safe?"',
    }),
    fact({
      entityId: GROWTH_CAMPAIGN_ID,
      predicate: 'user_response_request',
      value: 'Most requested: a Notion integration and team-wide investor updates',
      sourceId: 'src-intercom',
      confidence: 0.8,
      validFrom: recent(3),
      evidence: 'Intercom: "Can this generate investor updates for my whole team?"',
    }),
    fact({
      entityId: GROWTH_CAMPAIGN_ID,
      predicate: 'recommended_action',
      value:
        'Double down on LinkedIn founder audience, rewrite onboarding around Slack/Notion setup, and launch a security-focused landing page for teams of 10+',
      sourceId: 'src-funnel-derived',
      confidence: 0.86,
      validFrom: recent(2),
      evidence: 'Funnel analysis: LinkedIn + Email convert best; onboarding and security are the blockers.',
    }),
    // Sales-restricted: only admin + sales identities see revenue impact.
    fact({
      entityId: GROWTH_CAMPAIGN_ID,
      predicate: 'mrr_influenced',
      value: '$2,300 new MRR across 23 paid conversions; LinkedIn drove the most revenue',
      sourceId: 'src-stripe',
      confidence: 0.9,
      validFrom: recent(2),
      evidence: 'Stripe: 23 new paid subscriptions, $2,300 MRR, majority attributed to LinkedIn.',
    }),
  );

  for (const f of campaignFacts) {
    await graphService.ingestFact(f);
  }

  // --- Feature-scoped facts (feature performance brief) ---
  const featureFacts: Fact[] = [
    fact({ entityId: GROWTH_FEATURE_ID, predicate: 'exposure', value: '430 users saw the Weekly Investor Update feature', sourceId: 'src-posthog', confidence: 0.9, validFrom: recent(5), evidence: 'PostHog: 430 unique users exposed to the feature.' }),
    fact({ entityId: GROWTH_FEATURE_ID, predicate: 'activation', value: '119 users activated it', sourceId: 'src-posthog', confidence: 0.9, validFrom: recent(5), evidence: 'PostHog: 119 activation events.' }),
    fact({ entityId: GROWTH_FEATURE_ID, predicate: 'repeat_usage', value: '38 users used it more than twice', sourceId: 'src-posthog', confidence: 0.88, validFrom: recent(5), evidence: 'PostHog: 38 users with 3+ sessions.' }),
    fact({ entityId: GROWTH_FEATURE_ID, predicate: 'paid_influence', value: '11 users converted to paid after using the feature', sourceId: 'src-posthog', confidence: 0.85, validFrom: recent(4), evidence: 'PostHog + Stripe join: 11 paid conversions touched the feature.' }),
    fact({ entityId: GROWTH_FEATURE_ID, predicate: 'best_segment', value: 'Founder-led teams of 5-30 employees', sourceId: 'src-funnel-derived', confidence: 0.83, validFrom: recent(4), evidence: 'Activation skews to founder-led teams of 5-30.' }),
    fact({ entityId: GROWTH_FEATURE_ID, predicate: 'drop_off', value: 'Setup/onboarding (connecting Slack and Notion)', sourceId: 'src-intercom', confidence: 0.82, validFrom: recent(4), evidence: 'Drop-off concentrated at the Slack/Notion connection step.' }),
  ];
  for (const f of featureFacts) {
    await graphService.ingestFact(f);
  }

  // --- Per-channel structured facts (drive computeFunnel in the brief) ---
  for (const channel of CHANNELS) {
    await graphService.ingestFact(
      fact({ entityId: channel.id, predicate: 'signups', value: channel.signups, sourceId: channel.source, confidence: 0.9, validFrom: recent(5), evidence: `${channel.name}: ${channel.signups} signups.` }),
    );
    await graphService.ingestFact(
      fact({ entityId: channel.id, predicate: 'activated', value: channel.activated, sourceId: channel.source, confidence: 0.9, validFrom: recent(5), evidence: `${channel.name}: ${channel.activated} activated.` }),
    );
    await graphService.ingestFact(
      fact({ entityId: channel.id, predicate: 'paid', value: channel.paid, sourceId: channel.source, confidence: 0.9, validFrom: recent(5), evidence: `${channel.name}: ${channel.paid} paid.` }),
    );
    if (channel.spend > 0) {
      await graphService.ingestFact(
        fact({ entityId: channel.id, predicate: 'spend', value: channel.spend, sourceId: channel.source, confidence: 0.9, validFrom: recent(5), evidence: `${channel.name}: $${channel.spend} spend.` }),
      );
    }
  }

  // --- Temporal supersession: old report verdict -> funnel-grounded verdict ---
  // Ingest the older verdict first, then a newer one with a different value. The
  // real SupersessionDetectionJob marks the old one 'superseded' and records a
  // FACT_SUPERSEDES_FACT edge, demonstrating the temporal moat on growth data.
  await graphService.ingestFact(
    fact({
      entityId: GROWTH_CAMPAIGN_ID,
      predicate: 'channel_verdict',
      value: 'Product Hunt is the winning channel',
      sourceId: 'src-notion-growth-report',
      confidence: 0.8,
      validFrom: recent(10),
      evidence: 'Week-1 Notion report: Product Hunt drove the most signups, so it is winning.',
    }),
  );
  await graphService.ingestFact(
    fact({
      entityId: GROWTH_CAMPAIGN_ID,
      predicate: 'channel_verdict',
      value:
        'Product Hunt wins awareness, but LinkedIn and Email win activation and paid conversion',
      sourceId: 'src-funnel-derived',
      confidence: 0.88,
      validFrom: recent(2),
      evidence: 'Funnel analysis supersedes the week-1 report: signups != qualified, paid users.',
    }),
  );

  // eslint-disable-next-line no-console
  console.log(
    `[GrowthSeed] Seeded "${GROWTH_CAMPAIGN_ID}" for tenant "${DEMO_TENANT}": ` +
      `4-channel funnel, ${featureFacts.length} feature facts, user-response insights, a ` +
      `superseded report verdict, and a sales-restricted MRR fact. Ask scope ` +
      `"${GROWTH_CAMPAIGN_ID}" to see permission-aware growth answers.`,
  );
}
