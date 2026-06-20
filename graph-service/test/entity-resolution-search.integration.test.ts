import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { GraphService } from '../src/services/GraphService.js';
import { Neo4jClient } from '../src/infra/neo4j.client.js';
import { postgresClient } from '../src/infra/postgres.client.js';
import { DeterministicEmbeddingProvider } from '../src/search/DeterministicEmbeddingProvider.js';
import { InMemoryVectorSearchStore } from '../src/search/InMemoryVectorSearchStore.js';
import { GraphNode } from '../src/domain/entities.js';
import { Fact } from '../src/domain/facts.js';

function node(
  tenantId: string,
  overrides: Partial<GraphNode> & Pick<GraphNode, 'id' | 'canonical_name' | 'source_id'>,
): GraphNode {
  const now = new Date().toISOString();
  return {
    id: overrides.id,
    tenant_id: tenantId,
    type: 'Account',
    canonical_name: overrides.canonical_name,
    aliases: [],
    source_system: 'test',
    source_id: overrides.source_id,
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

describe('entity resolution and vector index integration', () => {
  it('removes the duplicate vector entry and reindexes reassigned facts', async () => {
    const tenantId = 'org_resolution_search';
    const client = new Neo4jClient();
    const vectorStore = new InMemoryVectorSearchStore();
    const service = new GraphService(
      client,
      postgresClient,
      new DeterministicEmbeddingProvider(128),
      vectorStore,
    );
    const canonical = node(tenantId, {
      id: crypto.randomUUID(),
      canonical_name: 'Acme Corporation',
      source_id: 'crm-acme',
      source_system: 'crm',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    const duplicate = node(tenantId, {
      id: crypto.randomUUID(),
      canonical_name: 'acme corporation',
      aliases: ['legacy-acme-handle'],
      source_id: 'support-acme',
      source_system: 'support',
      created_at: '2026-02-01T00:00:00.000Z',
    });
    const source = node(tenantId, {
      id: crypto.randomUUID(),
      type: 'Source',
      canonical_name: 'Public support ticket',
      source_id: 'ticket-source',
    });
    const fact: Fact = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      entity_id: duplicate.id,
      predicate: 'customer tier',
      value: 'enterprise',
      confidence: 0.95,
      status: 'current',
      valid_from: null,
      valid_to: null,
      recorded_from: null,
      recorded_to: null,
      source_id: source.source_id,
      evidence_spans: ['Acme is an enterprise customer'],
      last_seen_at: new Date().toISOString(),
    };

    await service.ingestNode(canonical);
    await service.ingestNode(duplicate);
    await service.ingestNode(source);
    await service.ingestFact(fact);

    const report = await service.resolveOutstandingEntities(tenantId);

    expect(report.autoMergedCount).toBe(1);
    const nodeHits = await service.search(tenantId, 'legacy-acme-handle', {
      resourceTypes: ['Account'],
      minScore: 0.1,
    });
    expect(nodeHits.map((hit) => hit.document.resourceId)).toContain(canonical.id);
    expect(nodeHits.map((hit) => hit.document.resourceId)).not.toContain(duplicate.id);

    const factHits = await service.search(tenantId, 'enterprise customer tier', {
      resourceTypes: ['Fact'],
      minScore: 0.1,
    });
    expect(factHits[0]?.document.resourceId).toBe(fact.id);
    expect(factHits[0]?.document.metadata.entityId).toBe(canonical.id);

    await Promise.all([service.closeSearchIndex(), client.close()]);
  });
});
