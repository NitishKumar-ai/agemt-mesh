import { describe, it, expect, beforeEach } from 'vitest';
import { trustWorkflowService } from '../src/services/TrustWorkflowService.js';
import { neo4jClient, graphService, Fact, GraphNode } from '@agentmesh/graph-service';
import crypto from 'node:crypto';

describe('TrustWorkflowService & Answering tests', () => {
  beforeEach(async () => {
    await neo4jClient.clear();
    await graphService.clearSearchIndex();
  });

  it('should generate Onboarding Brief workflow details', async () => {
    const tenantId = 'org_test_123';
    const userId = 'user_999';

    const output = await trustWorkflowService.generateOnboardingBrief(tenantId, userId, {
      user: 'Nitish',
      team: 'Engineering',
      role: 'Staff Engineer',
    });

    expect(output.workflow_id).toBe('onboarding_brief');
    expect(output.tenant_id).toBe(tenantId);
    expect(output.scope).toBe('team:Engineering');
    expect(output.sections).toHaveLength(5);
    expect(output.sections[0].title).toBe('Team Overview');
    expect(output.confidence).toBeLessThan(0.5);
    expect(output.warnings).toContain(
      'No permission-visible cited facts were found for this scope; factual sections abstain.',
    );
  });

  it('should generate Weekly Digest details', async () => {
    const tenantId = 'org_test_123';
    const userId = 'user_999';

    const now = new Date().toISOString();
    const team: GraphNode = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      type: 'Team',
      canonical_name: 'Engineering',
      aliases: [],
      source_system: 'test',
      source_id: 'engineering-team',
      confidence: 1,
      status: 'current',
      created_at: now,
      updated_at: now,
      valid_from: now,
      valid_to: null,
      recorded_from: now,
      recorded_to: null,
      last_seen_at: now,
      permissions_hash: null,
      source_url: null,
      properties: {},
    };
    const source: GraphNode = {
      ...team,
      id: crypto.randomUUID(),
      type: 'Source',
      canonical_name: 'Roadmap source',
      source_id: 'source_roadmap',
    };
    await graphService.ingestNode(team);
    await graphService.ingestNode(source);

    // Ingest a permission-visible team fact in range.
    const fact: Fact = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      entity_id: team.id,
      predicate: 'deadline',
      value: '2026-08-01',
      confidence: 0.9,
      status: 'current',
      valid_from: '2026-06-07T00:00:00Z',
      valid_to: null,
      recorded_from: '2026-06-08T10:00:00Z',
      recorded_to: null,
      source_id: 'source_roadmap',
      evidence_spans: ['Target is Aug 1'],
      last_seen_at: new Date().toISOString(),
    };

    await neo4jClient.upsertFact(fact);

    const output = await trustWorkflowService.generateWeeklyDigest(tenantId, userId, {
      team: 'Engineering',
      dateRange: {
        from: '2026-06-05T00:00:00Z',
        to: '2026-06-10T00:00:00Z',
      },
    });

    expect(output.workflow_id).toBe('weekly_digest');
    expect(output.sections[0].title).toBe('What Changed');
    expect(output.citations).toHaveLength(1);
  });

  it('should calibrate confidence correctly based on source authority and contradictions', () => {
    const high = trustWorkflowService.calibrateConfidence({
      sourcesCount: 3,
      hasContradictions: false,
      hasCurrentFact: true,
      isAuthoritative: true,
      graphSupportScore: 0.9,
    });
    expect(high.level).toBe('high');
    expect(high.score).toBeGreaterThanOrEqual(0.8);

    const low = trustWorkflowService.calibrateConfidence({
      sourcesCount: 1,
      hasContradictions: true,
      hasCurrentFact: true,
      isAuthoritative: false,
      graphSupportScore: 0.2,
    });
    expect(low.level).toBe('abstain');
  });

  it('should retrieve answer or abstain when contradictions occur', async () => {
    const tenantId = 'org_test_123';
    const projectId = crypto.randomUUID();

    // 1. Ask when no facts exist
    const noFactsResult = await trustWorkflowService.retrieveAndAnswer(
      tenantId,
      'When are we launching?',
      projectId,
    );
    expect(noFactsResult.level).toBe('abstain');
    expect(noFactsResult.answer).toContain('not enough evidence');

    // 2. Ingest two contradicting facts
    const now = new Date().toISOString();
    const publicSource: GraphNode = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      type: 'Document',
      canonical_name: 'Public roadmap source',
      aliases: [],
      source_system: 'notion',
      source_id: 'notion_roadmap',
      confidence: 1,
      status: 'current',
      created_at: now,
      updated_at: now,
      valid_from: now,
      valid_to: null,
      recorded_from: now,
      recorded_to: null,
      last_seen_at: now,
      permissions_hash: null,
      source_url: null,
      properties: {},
    };
    await graphService.ingestNode(publicSource);
    await graphService.ingestNode({
      ...publicSource,
      id: crypto.randomUUID(),
      canonical_name: 'Public Slack source',
      source_system: 'slack',
      source_id: 'slack_chat',
    });

    const fact1: Fact = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      entity_id: projectId,
      predicate: 'deadline',
      value: '2026-08-01',
      confidence: 0.85,
      status: 'contradicted',
      valid_from: '2026-06-07T00:00:00Z',
      valid_to: null,
      recorded_from: '2026-06-08T10:00:00Z',
      recorded_to: null,
      source_id: 'notion_roadmap',
      evidence_spans: [],
      last_seen_at: new Date().toISOString(),
    };

    const fact2: Fact = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      entity_id: projectId,
      predicate: 'deadline',
      value: '2026-08-10',
      confidence: 0.85,
      status: 'contradicted',
      valid_from: '2026-06-07T00:00:00Z',
      valid_to: null,
      recorded_from: '2026-06-08T10:00:00Z',
      recorded_to: null,
      source_id: 'slack_chat',
      evidence_spans: [],
      last_seen_at: new Date().toISOString(),
    };

    await neo4jClient.upsertFact(fact1);
    await neo4jClient.upsertFact(fact2);

    const result = await trustWorkflowService.retrieveAndAnswer(
      tenantId,
      'When are we launching?',
      projectId,
    );
    expect(result.level).toBe('abstain');
    expect(result.answer).toContain('conflicting sources');
    expect(result.answer).toContain('2026-08-01');
    expect(result.answer).toContain('2026-08-10');
  });
});

describe('Growth Memory briefs', () => {
  const tenantId = 'org_growth_test';

  beforeEach(async () => {
    await neo4jClient.clear();
    await graphService.clearSearchIndex();
  });

  function publicSource(sourceId: string, type: GraphNode['type']): GraphNode {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      type,
      canonical_name: sourceId,
      aliases: [],
      source_system: 'test',
      source_id: sourceId,
      confidence: 0.95,
      status: 'current',
      created_at: now,
      updated_at: now,
      valid_from: now,
      valid_to: null,
      recorded_from: now,
      recorded_to: null,
      last_seen_at: now,
      permissions_hash: null,
      source_url: null,
      properties: {},
    };
  }

  function growthFact(entityId: string, predicate: string, value: unknown, sourceId: string, daysAgo: number): Fact {
    const validFrom = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
    return {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      entity_id: entityId,
      predicate,
      value,
      confidence: 0.9,
      status: 'current',
      valid_from: validFrom,
      valid_to: null,
      recorded_from: validFrom,
      recorded_to: null,
      source_id: sourceId,
      evidence_spans: [`${predicate}=${String(value)}`],
      last_seen_at: new Date().toISOString(),
    };
  }

  it('ranks channels by paid rate, not signup volume', async () => {
    const facts = [
      // Product Hunt: most signups, worst conversion.
      growthFact('channel-producthunt', 'signups', 900, 'src-ph', 5),
      growthFact('channel-producthunt', 'activated', 60, 'src-ph', 5),
      growthFact('channel-producthunt', 'paid', 2, 'src-ph', 5),
      // LinkedIn: fewer signups, best conversion.
      growthFact('channel-linkedin', 'signups', 300, 'src-li', 5),
      growthFact('channel-linkedin', 'activated', 120, 'src-li', 5),
      growthFact('channel-linkedin', 'paid', 12, 'src-li', 5),
      growthFact('channel-linkedin', 'spend', 4200, 'src-li', 5),
    ];
    const funnel = trustWorkflowService.computeFunnel(facts);
    expect(funnel[0].channel).toBe('Linkedin');
    expect(funnel[0].paidRate).toBeGreaterThan(funnel[1].paidRate);
    expect(funnel.find((r) => r.channel === 'Producthunt')!.signups).toBe(900);
    expect(funnel[0].costPerPaid).toBe(350); // 4200 / 12
  });

  it('ranks a low-signup high-conversion channel above a high-signup low-conversion one by quality score', () => {
    const facts = [
      // Twitter: huge signup volume, almost no paid conversion.
      growthFact('channel-twitter', 'signups', 5000, 'src-tw', 5),
      growthFact('channel-twitter', 'activated', 200, 'src-tw', 5),
      growthFact('channel-twitter', 'paid', 5, 'src-tw', 5),
      // Referral: tiny signup volume, excellent conversion.
      growthFact('channel-referral', 'signups', 120, 'src-ref', 5),
      growthFact('channel-referral', 'activated', 90, 'src-ref', 5),
      growthFact('channel-referral', 'paid', 30, 'src-ref', 5),
    ];
    const funnel = trustWorkflowService.computeFunnel(facts);

    // Quality, not volume, decides the leader.
    expect(funnel[0].channel).toBe('Referral');
    expect(funnel[0].rank).toBe(1);
    expect(funnel[1].channel).toBe('Twitter');
    expect(funnel[1].rank).toBe(2);
    // The high-volume channel still reports the larger signup count.
    expect(funnel[1].signups).toBeGreaterThan(funnel[0].signups);
    // Quality score is a normalized 0..1 composite, higher for the leader.
    expect(funnel[0].qualityScore).toBeGreaterThan(funnel[1].qualityScore);
    expect(funnel[0].qualityScore).toBeGreaterThanOrEqual(0);
    expect(funnel[0].qualityScore).toBeLessThanOrEqual(1);
  });

  it('groups User Response facts into labelled themes', async () => {
    await graphService.ingestNode(publicSource('src-li', 'Channel'));
    await graphService.ingestNode(publicSource('src-feedback', 'Insight'));

    const campaign = 'campaign-themed';
    for (const f of [
      // A minimal channel funnel so the brief has ranked data.
      growthFact('channel-linkedin', 'signups', 300, 'src-li', 5),
      growthFact('channel-linkedin', 'activated', 120, 'src-li', 5),
      growthFact('channel-linkedin', 'paid', 12, 'src-li', 5),
      // Themed user-response facts on the campaign.
      growthFact(campaign, 'user_response_positive', 'Loved the onboarding flow', 'src-feedback', 2),
      growthFact(campaign, 'user_response_confusion', 'Unclear how pricing tiers differ', 'src-feedback', 2),
      growthFact(campaign, 'user_response_objection', 'Too expensive for a solo founder', 'src-feedback', 2),
      growthFact(campaign, 'user_response_request', 'Please add a Slack integration', 'src-feedback', 2),
    ]) {
      await graphService.ingestFact(f);
    }

    const brief = await trustWorkflowService.generateFounderGrowthBrief(tenantId, undefined, {
      campaign,
      channels: ['channel-linkedin'],
    });

    const userResponse = brief.sections.find((s) => s.title === 'User Response');
    expect(userResponse).toBeDefined();
    expect(userResponse?.type).toBe('list');
    // Readable, theme-labelled content.
    expect(userResponse?.content).toContain('Positive:');
    expect(userResponse?.content).toContain('Confusion:');
    expect(userResponse?.content).toContain('Objection:');
    expect(userResponse?.content).toContain('Requests:');
    expect(userResponse?.content).toContain('Loved the onboarding flow');

    // Structured data carries one entry per non-empty theme.
    const themes = userResponse?.data as Array<{ theme: string; facts: unknown[] }>;
    const themeLabels = themes.map((t) => t.theme);
    expect(themeLabels).toEqual(['Positive', 'Confusion', 'Objection', 'Requests']);
  });

  it('generates a founder growth brief with a superseded report verdict', async () => {
    await graphService.ingestNode(publicSource('src-li', 'Channel'));
    await graphService.ingestNode(publicSource('src-ph', 'Channel'));
    await graphService.ingestNode(publicSource('src-report', 'Report'));
    await graphService.ingestNode(publicSource('src-funnel', 'Insight'));

    const campaign = 'campaign-test';
    // Channel funnels.
    for (const f of [
      growthFact('channel-linkedin', 'signups', 300, 'src-li', 5),
      growthFact('channel-linkedin', 'activated', 120, 'src-li', 5),
      growthFact('channel-linkedin', 'paid', 12, 'src-li', 5),
      growthFact('channel-producthunt', 'signups', 900, 'src-ph', 5),
      growthFact('channel-producthunt', 'activated', 60, 'src-ph', 5),
      growthFact('channel-producthunt', 'paid', 2, 'src-ph', 5),
      growthFact(campaign, 'recommended_action', 'Double down on LinkedIn', 'src-funnel', 2),
    ]) {
      await graphService.ingestFact(f);
    }

    // Older verdict then newer verdict -> supersession via the real job.
    await graphService.ingestFact(
      growthFact(campaign, 'channel_verdict', 'Product Hunt is the winning channel', 'src-report', 10),
    );
    await graphService.ingestFact(
      growthFact(campaign, 'channel_verdict', 'LinkedIn wins paid conversion', 'src-funnel', 2),
    );

    const brief = await trustWorkflowService.generateFounderGrowthBrief(tenantId, undefined, {
      campaign,
      channels: ['channel-linkedin', 'channel-producthunt'],
    });

    expect(brief.workflow_id).toBe('founder_growth_brief');
    const summary = brief.sections.find((s) => s.title === 'Executive Summary');
    expect(summary?.content).toContain('Linkedin');
    const change = brief.sections.find((s) => s.title === 'What Changed Since the Last Report');
    expect(change?.content).toContain('Product Hunt is the winning channel');
    expect(change?.content).toContain('LinkedIn wins paid conversion');
  });
});
