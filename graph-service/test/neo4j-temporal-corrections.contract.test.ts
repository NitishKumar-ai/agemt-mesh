import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { GraphNode } from '../src/domain/entities.js';
import { Fact } from '../src/domain/facts.js';
import { GraphRelationship } from '../src/domain/relationships.js';
import { Neo4jClient } from '../src/infra/neo4j.client.js';

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
    source_system: 'contract-test',
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

function makeFact(tenantId: string, entityId: string, sourceId: string): Fact {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    entity_id: entityId,
    predicate: 'account_tier',
    value: { name: 'enterprise' },
    confidence: 0.95,
    status: 'current',
    valid_from: now,
    valid_to: null,
    recorded_from: now,
    recorded_to: null,
    source_id: sourceId,
    evidence_spans: ['The account is on the enterprise tier.'],
    last_seen_at: now,
  };
}

function makeRelationship(
  tenantId: string,
  sourceNodeId: string,
  targetNodeId: string,
): GraphRelationship {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    type: 'ACCOUNT_HAS_OWNER',
    source_node_id: sourceNodeId,
    target_node_id: targetNodeId,
    confidence: 0.87,
    evidence_source_ids: ['contract-source'],
    extraction_method: 'contract-test',
    valid_from: now,
    valid_to: null,
    recorded_from: now,
    recorded_to: null,
    status: 'current',
    correction_state: 'uncorrected',
    properties: { note: 'preserve-me' },
  };
}

describe('In-memory temporal correction persistence', () => {
  it('matches read, reassignment, self-loop, and tenant-isolation semantics', async () => {
    const client = new Neo4jClient({ uri: '' });
    const tenantId = `memory-corrections-${crypto.randomUUID()}`;
    const otherTenantId = `memory-corrections-${crypto.randomUUID()}`;
    const originalEntity = makeNode(tenantId, {
      id: crypto.randomUUID(),
      canonical_name: 'Original account',
      source_id: 'original-account',
    });
    const replacementEntity = makeNode(tenantId, {
      id: crypto.randomUUID(),
      canonical_name: 'Replacement account',
      source_id: 'replacement-account',
    });
    const owner = makeNode(tenantId, {
      id: crypto.randomUUID(),
      type: 'Person',
      canonical_name: 'Owner',
      source_id: 'owner',
    });
    const source = makeNode(tenantId, {
      id: crypto.randomUUID(),
      type: 'Source',
      canonical_name: 'Source',
      source_id: 'source',
    });
    const fact = makeFact(tenantId, originalEntity.id, source.id);
    const relationship = makeRelationship(tenantId, originalEntity.id, owner.id);
    const selfLoopCandidate = makeRelationship(tenantId, replacementEntity.id, owner.id);

    await Promise.all(
      [originalEntity, replacementEntity, owner, source].map((node) => client.upsertNode(node)),
    );
    await client.upsertFact(fact);
    await Promise.all([
      client.upsertRelationship(relationship),
      client.upsertRelationship(selfLoopCandidate),
    ]);

    expect(await client.getNode(originalEntity.id, tenantId)).toMatchObject(originalEntity);
    expect(await client.getNode(originalEntity.id, otherTenantId)).toBeUndefined();
    expect((await client.listFacts(tenantId)).map((storedFact) => storedFact.id)).toEqual([
      fact.id,
    ]);
    expect(await client.getFact(fact.id, otherTenantId)).toBeUndefined();

    const reassignedAt = '2026-06-20T12:00:00.000Z';
    expect(
      await client.reassignFact(fact.id, tenantId, replacementEntity.id, reassignedAt),
    ).toMatchObject({
      entity_id: replacementEntity.id,
      last_seen_at: reassignedAt,
    });
    expect(
      await client.reassignRelationship(
        relationship.id,
        tenantId,
        originalEntity.id,
        replacementEntity.id,
      ),
    ).toMatchObject({
      source_node_id: replacementEntity.id,
      target_node_id: owner.id,
      properties: relationship.properties,
    });
    expect(
      await client.reassignRelationship(
        selfLoopCandidate.id,
        tenantId,
        owner.id,
        replacementEntity.id,
      ),
    ).toBeUndefined();
    expect(await client.getRelationship(selfLoopCandidate.id, tenantId)).toBeUndefined();
    expect(await client.reassignFact(fact.id, otherTenantId, replacementEntity.id)).toBeUndefined();

    await client.close();
  });
});

describeNeo4j('Neo4j temporal correction persistence contract', () => {
  it('supports tenant-isolated reads and atomically reassigns fact and relationship edges', async () => {
    const client = new Neo4jClient({
      uri,
      user: process.env.TEST_NEO4J_USER ?? 'neo4j',
      password: process.env.TEST_NEO4J_PASSWORD ?? 'test-password',
    });
    const tenantId = `temporal-corrections-${crypto.randomUUID()}`;
    const otherTenantId = `temporal-corrections-${crypto.randomUUID()}`;
    const originalEntity = makeNode(tenantId, {
      id: crypto.randomUUID(),
      canonical_name: 'Original account',
      source_id: 'original-account',
    });
    const replacementEntity = makeNode(tenantId, {
      id: crypto.randomUUID(),
      canonical_name: 'Replacement account',
      source_id: 'replacement-account',
    });
    const owner = makeNode(tenantId, {
      id: crypto.randomUUID(),
      type: 'Person',
      canonical_name: 'Account owner',
      source_id: 'account-owner',
    });
    const source = makeNode(tenantId, {
      id: crypto.randomUUID(),
      type: 'Source',
      canonical_name: 'CRM export',
      source_id: 'crm-export',
    });
    const otherTenantEntity = makeNode(otherTenantId, {
      id: crypto.randomUUID(),
      canonical_name: 'Other tenant account',
      source_id: 'other-tenant-account',
    });
    const otherTenantSource = makeNode(otherTenantId, {
      id: crypto.randomUUID(),
      type: 'Source',
      canonical_name: 'Other tenant source',
      source_id: 'other-tenant-source',
    });
    const fact = makeFact(tenantId, originalEntity.id, source.id);
    const otherTenantFact = makeFact(otherTenantId, otherTenantEntity.id, otherTenantSource.id);
    const relationship = makeRelationship(tenantId, originalEntity.id, owner.id);
    const selfLoopCandidate = makeRelationship(tenantId, replacementEntity.id, owner.id);
    const otherTenantRelationship = makeRelationship(
      otherTenantId,
      otherTenantEntity.id,
      otherTenantSource.id,
    );

    try {
      await Promise.all(
        [
          originalEntity,
          replacementEntity,
          owner,
          source,
          otherTenantEntity,
          otherTenantSource,
        ].map((node) => client.upsertNode(node)),
      );
      await Promise.all([client.upsertFact(fact), client.upsertFact(otherTenantFact)]);
      await Promise.all([
        client.upsertRelationship(relationship),
        client.upsertRelationship(selfLoopCandidate),
        client.upsertRelationship(otherTenantRelationship),
      ]);

      expect(await client.getNode(originalEntity.id, tenantId)).toMatchObject(originalEntity);
      expect(await client.getNode(originalEntity.id, otherTenantId)).toBeUndefined();
      expect(await client.getFact(fact.id, tenantId)).toMatchObject(fact);
      expect(await client.getFact(fact.id, otherTenantId)).toBeUndefined();
      expect(await client.getRelationship(relationship.id, tenantId)).toMatchObject(relationship);
      expect(await client.getRelationship(relationship.id, otherTenantId)).toBeUndefined();

      // A Fact node remains readable even if a supporting graph edge is temporarily absent.
      await client.runCypher(
        `MATCH (f:Fact {id: $fact_id, tenant_id: $tenant_id})
               -[supported:FACT_SUPPORTED_BY_SOURCE]->()
         DELETE supported`,
        { fact_id: fact.id, tenant_id: tenantId },
      );
      const tenantFacts = await client.listFacts(tenantId);
      expect(tenantFacts.map((storedFact) => storedFact.id)).toEqual([fact.id]);
      expect(tenantFacts[0]).toMatchObject({
        entity_id: originalEntity.id,
        source_id: source.id,
        value: fact.value,
      });
      expect((await client.listFacts(otherTenantId)).map((storedFact) => storedFact.id)).toEqual([
        otherTenantFact.id,
      ]);

      expect(
        await client.reassignFact(fact.id, otherTenantId, otherTenantEntity.id),
      ).toBeUndefined();
      const reassignedAt = '2026-06-20T12:00:00.000Z';
      expect(
        await client.reassignFact(fact.id, tenantId, replacementEntity.id, reassignedAt),
      ).toMatchObject({
        id: fact.id,
        tenant_id: tenantId,
        entity_id: replacementEntity.id,
        last_seen_at: reassignedAt,
      });
      const factEdges = (await client.runCypher(
        `MATCH (entity)-[:HAS_FACT]->(f:Fact {id: $fact_id, tenant_id: $tenant_id})
         RETURN collect(entity.id) AS entity_ids`,
        { fact_id: fact.id, tenant_id: tenantId },
      )) as Array<{ entity_ids: string[] }>;
      expect(factEdges[0]?.entity_ids).toEqual([replacementEntity.id]);

      expect(
        await client.reassignRelationship(
          relationship.id,
          otherTenantId,
          originalEntity.id,
          otherTenantEntity.id,
        ),
      ).toBeUndefined();
      const reassignedRelationship = await client.reassignRelationship(
        relationship.id,
        tenantId,
        originalEntity.id,
        replacementEntity.id,
      );
      expect(reassignedRelationship).toMatchObject({
        id: relationship.id,
        source_node_id: replacementEntity.id,
        target_node_id: owner.id,
        confidence: relationship.confidence,
        evidence_source_ids: relationship.evidence_source_ids,
        properties: relationship.properties,
      });
      const relationshipEdges = (await client.runCypher(
        `MATCH (source)-[r]->(target)
         WHERE r.id = $relationship_id
           AND source.tenant_id = $tenant_id
           AND target.tenant_id = $tenant_id
         RETURN collect(source.id) AS source_ids, collect(target.id) AS target_ids`,
        { relationship_id: relationship.id, tenant_id: tenantId },
      )) as Array<{ source_ids: string[]; target_ids: string[] }>;
      expect(relationshipEdges[0]?.source_ids).toEqual([replacementEntity.id]);
      expect(relationshipEdges[0]?.target_ids).toEqual([owner.id]);

      expect(
        await client.reassignRelationship(
          selfLoopCandidate.id,
          tenantId,
          owner.id,
          replacementEntity.id,
        ),
      ).toBeUndefined();
      expect(await client.getRelationship(selfLoopCandidate.id, tenantId)).toBeUndefined();

      expect(await client.getFact(otherTenantFact.id, otherTenantId)).toMatchObject(
        otherTenantFact,
      );
      expect(await client.getRelationship(otherTenantRelationship.id, otherTenantId)).toMatchObject(
        otherTenantRelationship,
      );
    } finally {
      await Promise.all(
        [tenantId, otherTenantId].map((cleanupTenantId) =>
          client.runCypher('MATCH (n {tenant_id: $tenant_id}) DETACH DELETE n', {
            tenant_id: cleanupTenantId,
          }),
        ),
      );
      await client.close();
    }
  });
});
