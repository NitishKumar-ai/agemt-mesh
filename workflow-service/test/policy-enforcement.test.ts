import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { TrustWorkflowService } from '../src/services/TrustWorkflowService.js';
import { neo4jClient, graphService, PolicyEngine, Fact, GraphNode } from '@agentmesh/graph-service';

describe('TrustWorkflowService permission enforcement', () => {
  let policy: PolicyEngine;
  let service: TrustWorkflowService;

  beforeEach(async () => {
    await neo4jClient.clear();
    await graphService.clearSearchIndex();
    policy = new PolicyEngine();
    service = new TrustWorkflowService(graphService, policy);
  });

  it('abstains for an unauthorized caller even when restricted facts exist', async () => {
    const tenantId = 'org_perm';
    const projectId = crypto.randomUUID();
    const now = new Date().toISOString();

    const sourceNode: GraphNode = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      type: 'Document',
      canonical_name: 'Board memo',
      aliases: [],
      source_system: 'gdrive',
      source_id: 'board_memo_doc',
      confidence: 0.95,
      status: 'current',
      created_at: now,
      updated_at: now,
      valid_from: now,
      valid_to: null,
      recorded_from: now,
      recorded_to: null,
      last_seen_at: now,
      permissions_hash: 'executive',
      source_url: null,
      properties: {},
    };
    await graphService.ingestNode(sourceNode);

    const fact: Fact = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      entity_id: projectId,
      predicate: 'acquisition_target',
      value: 'Acme Corp',
      confidence: 0.9,
      status: 'current',
      valid_from: now,
      valid_to: null,
      recorded_from: now,
      recorded_to: null,
      source_id: 'board_memo_doc',
      evidence_spans: [],
      last_seen_at: now,
    };
    await neo4jClient.upsertFact(fact);

    const deniedResult = await service.retrieveAndAnswer(
      tenantId,
      'who are we acquiring?',
      projectId,
      'rank_and_file_user',
    );
    expect(deniedResult.level).toBe('abstain');
    expect(deniedResult.citations).toHaveLength(0);
    expect(deniedResult.answer).not.toContain('Acme Corp');

    policy.grantAccess({
      tenant_id: tenantId,
      user_id: 'exec_user',
      permission_hashes: ['executive'],
    });
    const allowedResult = await service.retrieveAndAnswer(
      tenantId,
      'who are we acquiring?',
      projectId,
      'exec_user',
    );
    expect(allowedResult.level).not.toBe('abstain');
    expect(allowedResult.answer).toContain('Acme Corp');
    expect(allowedResult.citations).toHaveLength(1);
  });

  it('does not leak restricted conflict values to an unauthorized caller', async () => {
    const tenantId = 'org_perm_conflict';
    const projectId = crypto.randomUUID();
    const now = new Date().toISOString();

    const restrictedNode: GraphNode = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      type: 'Document',
      canonical_name: 'Restricted memo',
      aliases: [],
      source_system: 'gdrive',
      source_id: 'restricted_source',
      confidence: 0.9,
      status: 'current',
      created_at: now,
      updated_at: now,
      valid_from: now,
      valid_to: null,
      recorded_from: now,
      recorded_to: null,
      last_seen_at: now,
      permissions_hash: 'executive',
      source_url: null,
      properties: {},
    };
    await graphService.ingestNode(restrictedNode);

    const conflictingFact: Fact = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      entity_id: projectId,
      predicate: 'deadline',
      value: 'SECRET_DATE_2099',
      confidence: 0.85,
      status: 'contradicted',
      valid_from: now,
      valid_to: null,
      recorded_from: now,
      recorded_to: null,
      source_id: 'restricted_source',
      evidence_spans: [],
      last_seen_at: now,
    };
    await neo4jClient.upsertFact(conflictingFact);

    const result = await service.retrieveAndAnswer(
      tenantId,
      'when is the deadline?',
      projectId,
      'rank_and_file_user',
    );
    expect(result.answer).not.toContain('SECRET_DATE_2099');
  });

  it('surfaces explicitly public facts to a caller with no grants', async () => {
    const tenantId = 'org_perm_public';
    const projectId = crypto.randomUUID();
    const now = new Date().toISOString();

    const publicSource: GraphNode = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      type: 'Document',
      canonical_name: 'Public status page',
      aliases: [],
      source_system: 'notion',
      source_id: 'public_source',
      confidence: 0.9,
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

    const fact: Fact = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      entity_id: projectId,
      predicate: 'status',
      value: 'on_track',
      confidence: 0.9,
      status: 'current',
      valid_from: now,
      valid_to: null,
      recorded_from: now,
      recorded_to: null,
      source_id: 'public_source',
      evidence_spans: [],
      last_seen_at: now,
    };
    await neo4jClient.upsertFact(fact);

    const result = await service.retrieveAndAnswer(
      tenantId,
      'what is the status?',
      projectId,
      'anyone',
    );
    expect(result.level).not.toBe('abstain');
    expect(result.answer).toContain('on_track');
  });

  it('fails closed when a fact source has no permission mapping', async () => {
    const tenantId = 'org_perm_unknown';
    const projectId = crypto.randomUUID();
    const now = new Date().toISOString();
    await neo4jClient.upsertFact({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      entity_id: projectId,
      predicate: 'secret',
      value: 'unmapped_value',
      confidence: 0.9,
      status: 'current',
      valid_from: now,
      valid_to: null,
      recorded_from: now,
      recorded_to: null,
      source_id: 'unregistered_source',
      evidence_spans: [],
      last_seen_at: now,
    });

    const result = await service.retrieveAndAnswer(tenantId, 'what is the secret?', projectId);
    expect(result.level).toBe('abstain');
    expect(result.answer).not.toContain('unmapped_value');
  });
});
