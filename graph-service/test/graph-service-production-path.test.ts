import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Fact } from '../src/domain/facts.js';
import { GraphNode } from '../src/domain/entities.js';
import { GraphRelationship } from '../src/domain/relationships.js';
import { Neo4jClient } from '../src/infra/neo4j.client.js';
import { PostgresClient } from '../src/infra/postgres.client.js';
import { DeterministicEmbeddingProvider } from '../src/search/DeterministicEmbeddingProvider.js';
import { InMemoryVectorSearchStore } from '../src/search/InMemoryVectorSearchStore.js';
import { GraphService } from '../src/services/GraphService.js';

const openResources: Array<{
  service: GraphService;
  graph: Neo4jClient;
  corrections: PostgresClient;
}> = [];

function createHarness() {
  const graph = new Neo4jClient({ uri: '' });
  const corrections = new PostgresClient();
  const service = new GraphService(
    graph,
    corrections,
    new DeterministicEmbeddingProvider(128),
    new InMemoryVectorSearchStore(),
  );
  openResources.push({ service, graph, corrections });
  return { service, graph, corrections };
}

function graphNode(
  tenantId: string,
  overrides: Partial<GraphNode> & Pick<GraphNode, 'id' | 'canonical_name'>,
): GraphNode {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: overrides.id,
    tenant_id: tenantId,
    type: 'Project',
    canonical_name: overrides.canonical_name,
    aliases: [],
    source_system: 'test',
    source_id: `source-${overrides.id}`,
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
    ...overrides,
  };
}

function fact(
  tenantId: string,
  entityId: string,
  overrides: Partial<Fact> & Pick<Fact, 'id' | 'value'>,
): Fact {
  return {
    id: overrides.id,
    tenant_id: tenantId,
    entity_id: entityId,
    predicate: 'status',
    value: overrides.value,
    confidence: 0.8,
    status: 'current',
    valid_from: '2026-01-01T00:00:00.000Z',
    valid_to: null,
    recorded_from: '2026-01-02T00:00:00.000Z',
    recorded_to: null,
    source_id: 'source-record',
    evidence_spans: ['production-path fixture'],
    last_seen_at: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function relationship(
  tenantId: string,
  sourceNodeId: string,
  targetNodeId: string,
  overrides: Partial<GraphRelationship> & Pick<GraphRelationship, 'id'>,
): GraphRelationship {
  return {
    id: overrides.id,
    tenant_id: tenantId,
    type: 'PROJECT_DEPENDS_ON_PROJECT',
    source_node_id: sourceNodeId,
    target_node_id: targetNodeId,
    confidence: 0.9,
    evidence_source_ids: [],
    extraction_method: 'test',
    valid_from: '2026-01-01T00:00:00.000Z',
    valid_to: null,
    recorded_from: '2026-01-01T00:00:00.000Z',
    recorded_to: null,
    status: 'current',
    correction_state: 'uncorrected',
    properties: {},
    ...overrides,
  };
}

function forbidRawInMemoryAccess(graph: Neo4jClient): void {
  vi.spyOn(graph, 'getInMemoryFacts').mockImplementation(() => {
    throw new Error('getInMemoryFacts must not be used');
  });
  vi.spyOn(graph, 'getInMemoryNodes').mockImplementation(() => {
    throw new Error('getInMemoryNodes must not be used');
  });
  vi.spyOn(graph, 'getInMemoryRelationships').mockImplementation(() => {
    throw new Error('getInMemoryRelationships must not be used');
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    openResources.splice(0).map(async ({ service, graph, corrections }) => {
      await service.closeSearchIndex();
      await graph.close();
      await corrections.close();
    }),
  );
});

describe('GraphService production datastore path', () => {
  it('uses listFacts for every temporal read and preserves tenant isolation', async () => {
    const { service, graph } = createHarness();
    const tenantId = 'tenant-temporal';
    const entityId = crypto.randomUUID();
    const otherEntityId = crypto.randomUUID();
    const current = fact(tenantId, entityId, {
      id: crypto.randomUUID(),
      value: 'current',
      valid_from: '2026-02-01T00:00:00.000Z',
      recorded_from: '2026-02-02T00:00:00.000Z',
    });
    const historical = fact(tenantId, entityId, {
      id: crypto.randomUUID(),
      value: 'historical',
      status: 'superseded',
      valid_to: '2026-01-31T23:59:59.000Z',
      recorded_to: '2026-02-02T00:00:00.000Z',
    });
    const conflict = fact(tenantId, entityId, {
      id: crypto.randomUUID(),
      value: 'conflict',
      status: 'contradicted',
      valid_from: '2026-01-15T00:00:00.000Z',
      recorded_from: '2026-01-16T00:00:00.000Z',
    });

    await Promise.all([
      graph.upsertFact(current),
      graph.upsertFact(historical),
      graph.upsertFact(conflict),
      graph.upsertFact(
        fact(tenantId, otherEntityId, { id: crypto.randomUUID(), value: 'other entity' }),
      ),
      graph.upsertFact(
        fact('tenant-other', entityId, { id: crypto.randomUUID(), value: 'other tenant' }),
      ),
    ]);
    forbidRawInMemoryAccess(graph);

    await expect(service.getFactsCurrent(entityId, tenantId)).resolves.toEqual([current]);
    await expect(service.getFactsHistory(entityId, tenantId)).resolves.toEqual(
      expect.arrayContaining([current, historical, conflict]),
    );
    await expect(
      service.getFactsAsOf(entityId, tenantId, '2026-01-10T00:00:00.000Z'),
    ).resolves.toEqual([historical]);
    await expect(
      service.getFactsChanges(
        entityId,
        tenantId,
        '2026-01-10T00:00:00.000Z',
        '2026-01-20T00:00:00.000Z',
      ),
    ).resolves.toEqual([conflict]);
    await expect(service.getFactsConflicts(entityId, tenantId)).resolves.toEqual([conflict]);
  });

  it('updates and invalidates facts through tenant-scoped datastore methods', async () => {
    const { service, graph, corrections } = createHarness();
    const tenantId = 'tenant-fact-correction';
    const entity = graphNode(tenantId, {
      id: crypto.randomUUID(),
      canonical_name: 'Fact correction entity',
    });
    const source = graphNode(tenantId, {
      id: crypto.randomUUID(),
      type: 'Source',
      canonical_name: 'Correction source',
      source_id: 'correction-source',
    });
    const original = fact(tenantId, entity.id, {
      id: crypto.randomUUID(),
      value: 'before',
      source_id: source.id,
    });
    const foreignFact = fact('tenant-other', entity.id, {
      id: crypto.randomUUID(),
      value: 'foreign',
    });

    await Promise.all([
      graph.upsertNode(entity),
      graph.upsertNode(source),
      graph.upsertFact(original),
      graph.upsertFact(foreignFact),
    ]);
    await service.reindexSearch(tenantId);
    forbidRawInMemoryAccess(graph);

    await expect(
      service.applyCorrection({
        tenant_id: tenantId,
        user_id: 'reviewer',
        correction_type: 'FACT_INVALIDATE',
        target_type: 'fact',
        target_id: foreignFact.id,
      }),
    ).rejects.toThrow(`Fact ${foreignFact.id} was not found for tenant ${tenantId}`);

    const update = await service.applyCorrection({
      tenant_id: tenantId,
      user_id: 'reviewer',
      correction_type: 'FACT_UPDATE',
      target_type: 'fact',
      target_id: original.id,
      reason: 'Authoritative correction',
      new_value: { value: 'after' },
    });
    const newFactId = update.affected_objects.facts[1];
    expect((await graph.getFact(original.id, tenantId))?.status).toBe('superseded');
    expect(await graph.getFact(newFactId, tenantId)).toMatchObject({
      entity_id: entity.id,
      value: 'after',
      status: 'current',
      source_id: original.source_id,
    });

    await service.applyCorrection({
      tenant_id: tenantId,
      user_id: 'reviewer',
      correction_type: 'FACT_INVALIDATE',
      target_type: 'fact',
      target_id: newFactId,
      reason: 'Withdrawn',
    });
    expect((await graph.getFact(newFactId, tenantId))?.status).toBe('invalidated');
    expect(
      (await service.search(tenantId, 'after')).map((hit) => hit.document.resourceId),
    ).not.toContain(newFactId);

    const audit = await corrections.listCorrections(tenantId);
    expect(audit).toHaveLength(2);
    expect(JSON.parse(audit[0].old_value || 'null')).toBe('before');
    expect(JSON.parse(audit[1].old_value || 'null')).toBe('after');
  });

  it('merges entities through mergeEntities and refreshes moved fact vectors', async () => {
    const { service, graph } = createHarness();
    const tenantId = 'tenant-merge';
    const canonical = graphNode(tenantId, {
      id: crypto.randomUUID(),
      canonical_name: 'Acme Corporation',
      aliases: ['Acme'],
    });
    const duplicate = graphNode(tenantId, {
      id: crypto.randomUUID(),
      canonical_name: 'Acme Holdings',
      aliases: ['Acme Legacy'],
    });
    const neighbor = graphNode(tenantId, {
      id: crypto.randomUUID(),
      canonical_name: 'Neighbor project',
    });
    const source = graphNode(tenantId, {
      id: crypto.randomUUID(),
      type: 'Source',
      canonical_name: 'Merge source',
      source_id: 'merge-source',
    });
    const movedFact = fact(tenantId, duplicate.id, {
      id: crypto.randomUUID(),
      value: 'enterprise customer',
      source_id: source.id,
    });
    const movedRelationship = relationship(tenantId, duplicate.id, neighbor.id, {
      id: crypto.randomUUID(),
    });

    await Promise.all([
      graph.upsertNode(canonical),
      graph.upsertNode(duplicate),
      graph.upsertNode(neighbor),
      graph.upsertNode(source),
      graph.upsertFact(movedFact),
      graph.upsertRelationship(movedRelationship),
    ]);
    await service.reindexSearch(tenantId);
    forbidRawInMemoryAccess(graph);
    const mergeEntitiesSpy = vi.spyOn(graph, 'mergeEntities');

    const result = await service.applyCorrection({
      tenant_id: tenantId,
      user_id: 'reviewer',
      correction_type: 'ENTITY_MERGE',
      target_type: 'entity',
      target_id: duplicate.id,
      new_value: { canonical_entity_id: canonical.id },
    });

    expect(mergeEntitiesSpy).toHaveBeenCalledOnce();
    expect(result.affected_objects.entities).toEqual([duplicate.id, canonical.id]);
    expect(await graph.getNode(canonical.id, tenantId)).toMatchObject({
      status: 'current',
      aliases: expect.arrayContaining(['Acme', 'Acme Holdings', 'Acme Legacy']),
    });
    expect((await graph.getNode(duplicate.id, tenantId))?.status).toBe('superseded');
    expect((await graph.getFact(movedFact.id, tenantId))?.entity_id).toBe(canonical.id);
    expect(await graph.getRelationship(movedRelationship.id, tenantId)).toMatchObject({
      source_node_id: canonical.id,
      target_node_id: neighbor.id,
    });
    expect(
      (await graph.listRelationships(tenantId)).some(
        (candidate) =>
          candidate.type === 'ENTITY_MERGED_INTO' &&
          candidate.source_node_id === duplicate.id &&
          candidate.target_node_id === canonical.id,
      ),
    ).toBe(true);

    const factHits = await service.search(tenantId, 'enterprise customer', {
      resourceTypes: ['Fact'],
      minScore: 0.1,
    });
    expect(factHits[0]?.document.metadata.entityId).toBe(canonical.id);
  });

  it('splits entities with validated fact and relationship reassignment', async () => {
    const { service, graph, corrections } = createHarness();
    const tenantId = 'tenant-split';
    const original = graphNode(tenantId, {
      id: crypto.randomUUID(),
      canonical_name: 'Combined account',
    });
    const neighbor = graphNode(tenantId, {
      id: crypto.randomUUID(),
      canonical_name: 'Neighbor',
    });
    const source = graphNode(tenantId, {
      id: crypto.randomUUID(),
      type: 'Source',
      canonical_name: 'Split source',
      source_id: 'split-source',
    });
    const reassignedFact = fact(tenantId, original.id, {
      id: crypto.randomUUID(),
      value: 'north division',
      source_id: source.id,
    });
    const reassignedRelationship = relationship(tenantId, original.id, neighbor.id, {
      id: crypto.randomUUID(),
    });

    await Promise.all([
      graph.upsertNode(original),
      graph.upsertNode(neighbor),
      graph.upsertNode(source),
      graph.upsertFact(reassignedFact),
      graph.upsertRelationship(reassignedRelationship),
    ]);
    await service.reindexSearch(tenantId);
    forbidRawInMemoryAccess(graph);

    const result = await service.applyCorrection({
      tenant_id: tenantId,
      user_id: 'reviewer',
      correction_type: 'ENTITY_SPLIT',
      target_type: 'entity',
      target_id: original.id,
      new_value: {
        targets: [
          {
            canonical_name: 'North account',
            facts_to_reassign: [reassignedFact.id],
          },
          {
            canonical_name: 'South account',
            relationships_to_reassign: [reassignedRelationship.id],
          },
        ],
      },
    });
    const northId = result.affected_objects.entities[1];
    const southId = result.affected_objects.entities[2];

    expect((await graph.getNode(original.id, tenantId))?.status).toBe('superseded');
    expect((await graph.getFact(reassignedFact.id, tenantId))?.entity_id).toBe(northId);
    expect(await graph.getRelationship(reassignedRelationship.id, tenantId)).toMatchObject({
      source_node_id: southId,
      target_node_id: neighbor.id,
    });
    expect(result.affected_objects.facts).toEqual([reassignedFact.id]);
    expect(result.affected_objects.relationships).toEqual([reassignedRelationship.id]);
    expect(await corrections.listCorrections(tenantId)).toHaveLength(1);

    const factHits = await service.search(tenantId, 'north division', {
      resourceTypes: ['Fact'],
      minScore: 0.1,
    });
    expect(factHits[0]?.document.metadata.entityId).toBe(northId);
  });
});
