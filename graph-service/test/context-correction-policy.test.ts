import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CorrectionController } from '../src/api/correction.routes.js';
import { policyEngine } from '../src/auth/PolicyEngine.js';
import { GraphNode } from '../src/domain/entities.js';
import { Fact } from '../src/domain/facts.js';
import { Neo4jClient } from '../src/infra/neo4j.client.js';
import { PostgresClient } from '../src/infra/postgres.client.js';
import { DeterministicEmbeddingProvider } from '../src/search/DeterministicEmbeddingProvider.js';
import { InMemoryVectorSearchStore } from '../src/search/InMemoryVectorSearchStore.js';
import { graphService, GraphService } from '../src/services/GraphService.js';

function sourceNode(
  tenantId: string,
  id: string,
  sourceId: string,
  permissionHash: string | null,
): GraphNode {
  const now = '2026-06-20T00:00:00.000Z';
  return {
    id,
    tenant_id: tenantId,
    type: 'Source',
    canonical_name: sourceId,
    aliases: [],
    source_system: 'test',
    source_id: sourceId,
    confidence: 1,
    status: 'current',
    created_at: now,
    updated_at: now,
    valid_from: now,
    valid_to: null,
    recorded_from: now,
    recorded_to: null,
    last_seen_at: now,
    permissions_hash: permissionHash,
    source_url: null,
    properties: {},
  };
}

function createService(graph = new Neo4jClient({ uri: '' })) {
  const corrections = new PostgresClient();
  const service = new GraphService(
    graph,
    corrections,
    new DeterministicEmbeddingProvider(32),
    new InMemoryVectorSearchStore(),
  );
  return { corrections, graph, service };
}

function sourceFact(tenantId: string, id: string, entityId: string, sourceId: string): Fact {
  const now = '2026-06-20T00:00:00.000Z';
  return {
    id,
    tenant_id: tenantId,
    entity_id: entityId,
    predicate: 'status',
    value: id,
    confidence: 1,
    status: 'current',
    valid_from: now,
    valid_to: null,
    recorded_from: now,
    recorded_to: null,
    source_id: sourceId,
    evidence_spans: [id],
    last_seen_at: now,
  };
}

describe('GraphService tenant context and source ACL hydration', () => {
  it('binds the tenant to the project and every matched context node', async () => {
    const { corrections, graph, service } = createService();
    const runCypher = vi.spyOn(graph, 'runCypher').mockResolvedValue([]);

    try {
      await service.getProjectContext('shared-project-id', 'tenant-a');

      expect(runCypher).toHaveBeenCalledOnce();
      const [query, params] = runCypher.mock.calls[0] ?? [];
      expect(params).toEqual({
        project_id: 'shared-project-id',
        tenant_id: 'tenant-a',
      });
      expect(query).toMatch(/Project\s*\{[^}]*tenant_id:\s*\$tenant_id[^}]*\}/);
      for (const label of ['Document', 'Person', 'Task', 'Decision']) {
        expect(query).toMatch(new RegExp(`${label}\\s*\\{[^}]*tenant_id:\\s*\\$tenant_id[^}]*\\}`));
      }
    } finally {
      await Promise.all([service.closeSearchIndex(), graph.close(), corrections.close()]);
    }
  });

  it('hydrates public and restricted ACLs from tenant-scoped graph data after restart', async () => {
    const graph = new Neo4jClient({ uri: '' });
    await Promise.all([
      graph.upsertNode(sourceNode('tenant-a', 'public-node', 'public-source', null)),
      graph.upsertNode(sourceNode('tenant-a', 'restricted-node', 'restricted-source', 'executive')),
      graph.upsertNode(
        sourceNode('tenant-b', 'foreign-node', 'restricted-source', 'foreign-executive'),
      ),
      graph.upsertFact(sourceFact('tenant-a', 'public-fact', 'entity-a', 'public-source')),
      graph.upsertFact(sourceFact('tenant-a', 'restricted-fact', 'entity-a', 'restricted-source')),
    ]);
    const { corrections, service } = createService(graph);

    try {
      expect(service.getSourcePermissionHash('tenant-a', 'public-source')).toBeUndefined();
      await expect(service.getFactsHistory('entity-a', 'tenant-a')).resolves.toHaveLength(2);
      expect(service.getSourcePermissionHash('tenant-a', 'public-source')).toBeNull();
      expect(service.getSourcePermissionHash('tenant-a', 'restricted-source')).toBe('executive');
      await expect(
        service.resolveSourcePermissionHash('tenant-b', 'restricted-source'),
      ).resolves.toBe('foreign-executive');

      await expect(
        service.resolveSourcePermissionHash('tenant-a', 'public-source'),
      ).resolves.toBeNull();
    } finally {
      await Promise.all([service.closeSearchIndex(), graph.close(), corrections.close()]);
    }
  });
});

describe('CorrectionController identity and audit policy', () => {
  let controller: CorrectionController;

  beforeEach(() => {
    policyEngine.clear();
    controller = new CorrectionController();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    policyEngine.clear();
  });

  it('forbids anonymous and cross-tenant identities and overwrites body user_id', async () => {
    policyEngine.grantAccess({
      tenant_id: 'tenant-a',
      user_id: 'actual-user',
      permission_hashes: ['correction-submit'],
    });
    policyEngine.grantAccess({
      tenant_id: 'tenant-b',
      user_id: 'foreign-user',
      permission_hashes: ['correction-submit'],
    });
    const applyCorrection = vi.spyOn(graphService, 'applyCorrection').mockResolvedValue({
      correction_id: 'correction-1',
      status: 'applied',
      affected_objects: { facts: [], entities: [], relationships: [] },
    });
    const body = {
      tenant_id: 'tenant-a',
      user_id: 'impersonated-admin',
      correction_type: 'FACT_INVALIDATE',
      target_type: 'fact',
      target_id: 'fact-1',
    };

    await expect(controller.submitCorrection(body, {})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.submitCorrection(body, { user: { id: 'foreign-user' } }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.submitCorrection(body, { user: { id: 'actual-user' } }),
    ).resolves.toMatchObject({ correction_id: 'correction-1' });

    expect(applyCorrection).toHaveBeenCalledOnce();
    expect(applyCorrection).toHaveBeenCalledWith({
      ...body,
      user_id: 'actual-user',
    });
  });

  it('requires an authenticated tenant administrator for audit reads', async () => {
    policyEngine.grantAccess({
      tenant_id: 'tenant-a',
      user_id: 'regular-user',
      permission_hashes: ['correction-submit'],
    });
    policyEngine.grantAccess({
      tenant_id: 'tenant-a',
      user_id: 'tenant-admin',
      permission_hashes: [],
      is_admin: true,
    });
    const getAuditLog = vi.spyOn(graphService, 'getAuditLog').mockResolvedValue([]);

    await expect(controller.getAuditLog({ user: { tenant_id: 'tenant-a' } })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.getAuditLog({ user: { tenant_id: 'tenant-a', id: 'regular-user' } }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.getAuditLog({ user: { tenant_id: 'tenant-a', id: 'tenant-admin' } }),
    ).resolves.toEqual([]);
    await expect(
      controller.getAuditLog({ user: { tenant_id: '', id: 'tenant-admin' } }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(getAuditLog).toHaveBeenCalledOnce();
    expect(getAuditLog).toHaveBeenCalledWith('tenant-a');
  });
});

describe('GraphService correction type validation', () => {
  it('rejects unsupported correction types without writing an applied audit record', async () => {
    const { corrections, graph, service } = createService();

    try {
      await expect(
        service.applyCorrection({
          tenant_id: 'tenant-a',
          user_id: 'reviewer',
          correction_type: 'UNKNOWN_CORRECTION',
          target_type: 'fact',
          target_id: 'fact-1',
        }),
      ).rejects.toThrow('Unsupported correction type');
      await expect(corrections.listCorrections('tenant-a')).resolves.toEqual([]);
    } finally {
      await Promise.all([service.closeSearchIndex(), graph.close(), corrections.close()]);
    }
  });
});
