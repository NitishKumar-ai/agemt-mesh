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
