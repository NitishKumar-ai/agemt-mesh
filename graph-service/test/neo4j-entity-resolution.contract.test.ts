import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { Neo4jClient } from '../src/infra/neo4j.client.js';
import { EntityResolutionJob } from '../src/jobs/entity-resolution.job.js';
import { GraphNode } from '../src/domain/entities.js';
import { Fact } from '../src/domain/facts.js';

const uri = process.env.TEST_NEO4J_URI;
const describeNeo4j = uri ? describe : describe.skip;

function makeNode(
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

describeNeo4j('Neo4j entity-resolution contract', () => {
  it('atomically rewires facts and relationships and remains idempotent', async () => {
    const client = new Neo4jClient({
      uri,
      user: process.env.TEST_NEO4J_USER ?? 'neo4j',
      password: process.env.TEST_NEO4J_PASSWORD ?? 'test-password',
    });
    const tenantId = `entity-resolution-${crypto.randomUUID()}`;
    const canonical = makeNode(tenantId, {
      id: crypto.randomUUID(),
      canonical_name: 'Acme Corporation',
      source_id: 'crm-acme',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    const duplicate = makeNode(tenantId, {
      id: crypto.randomUUID(),
      canonical_name: 'acme corporation',
      aliases: ['Acme Support'],
      source_id: 'support-acme',
      created_at: '2026-02-01T00:00:00.000Z',
    });
    const owner = makeNode(tenantId, {
      id: crypto.randomUUID(),
      type: 'Person',
      canonical_name: 'Account Owner',
      source_id: 'owner',
    });
    const source = makeNode(tenantId, {
      id: crypto.randomUUID(),
      type: 'Source',
      canonical_name: 'Support ticket',
      source_id: 'ticket',
    });
    const fact: Fact = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      entity_id: duplicate.id,
      predicate: 'tier',
      value: 'enterprise',
      confidence: 0.9,
      status: 'current',
      valid_from: null,
      valid_to: null,
      recorded_from: null,
      recorded_to: null,
      source_id: source.id,
      evidence_spans: [],
      last_seen_at: new Date().toISOString(),
    };

    try {
      await Promise.all([
        client.upsertNode(canonical),
        client.upsertNode(duplicate),
        client.upsertNode(owner),
        client.upsertNode(source),
      ]);
      await client.upsertFact(fact);
      await client.upsertRelationship({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        type: 'ACCOUNT_HAS_OWNER',
        source_node_id: duplicate.id,
        target_node_id: owner.id,
        confidence: 0.9,
        evidence_source_ids: [],
        extraction_method: 'contract-test',
        valid_from: null,
        valid_to: null,
        recorded_from: null,
        recorded_to: null,
        status: 'current',
        correction_state: 'uncorrected',
        properties: {},
      });

      const job = new EntityResolutionJob(client);
      const first = await job.resolveEntities(tenantId);
      expect(first.autoMergedCount).toBe(1);

      const nodes = await client.listNodes(tenantId);
      expect(nodes.find((node) => node.id === duplicate.id)?.status).toBe('superseded');
      expect(nodes.find((node) => node.id === canonical.id)?.aliases).toContain('Acme Support');

      const facts = await client.listFacts(tenantId);
      expect(facts.find((storedFact) => storedFact.id === fact.id)?.entity_id).toBe(canonical.id);

      const relationships = await client.listRelationships(tenantId);
      const ownerRelationship = relationships.find(
        (relationship) => relationship.type === 'ACCOUNT_HAS_OWNER',
      );
      expect(ownerRelationship?.source_node_id).toBe(canonical.id);
      expect(
        relationships.find((relationship) => relationship.type === 'ENTITY_MERGED_INTO')
          ?.source_node_id,
      ).toBe(duplicate.id);

      const second = await job.resolveEntities(tenantId);
      expect(second.resolvedCount).toBe(0);
    } finally {
      await client.runCypher('MATCH (n {tenant_id: $tenant_id}) DETACH DELETE n', {
        tenant_id: tenantId,
      });
      await client.close();
    }
  });
});
