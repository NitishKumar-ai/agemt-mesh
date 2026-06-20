import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { Fact } from '../src/domain/facts.js';
import { GraphNode, NodeType } from '../src/domain/entities.js';
import { GraphRelationship } from '../src/domain/relationships.js';
import { Neo4jClient } from '../src/infra/neo4j.client.js';
import { RelationUpsertJob } from '../src/jobs/relation-upsert.job.js';
import { SupersessionDetectionJob } from '../src/jobs/supersession-detection.job.js';

const uri = process.env.TEST_NEO4J_URI;
const describeNeo4j = uri ? describe : describe.skip;

function makeNode(tenantId: string, type: NodeType, canonicalName: string): GraphNode {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    type,
    canonical_name: canonicalName,
    aliases: [],
    source_system: 'ingestion-job-contract-test',
    source_id: crypto.randomUUID(),
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
}

function makeRelationship(
  tenantId: string,
  sourceNodeId: string,
  targetNodeId: string,
  overrides: Partial<GraphRelationship> = {},
): GraphRelationship {
  return {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    type: 'ACCOUNT_HAS_OWNER',
    source_node_id: sourceNodeId,
    target_node_id: targetNodeId,
    confidence: 0.9,
    evidence_source_ids: ['ingestion-job-contract-test'],
    extraction_method: 'ingestion-job-contract-test',
    valid_from: '2026-01-01T00:00:00.000Z',
    valid_to: null,
    recorded_from: '2026-01-02T00:00:00.000Z',
    recorded_to: null,
    status: 'current',
    correction_state: 'uncorrected',
    properties: {},
    ...overrides,
  };
}

function makeFact(
  tenantId: string,
  entityId: string,
  sourceId: string,
  predicate: string,
  value: string,
  validFrom: string,
  recordedFrom: string,
): Fact {
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
    recorded_from: recordedFrom,
    recorded_to: null,
    source_id: sourceId,
    evidence_spans: [value],
    last_seen_at: recordedFrom,
  };
}

async function seedNodes(client: Neo4jClient, nodes: GraphNode[]): Promise<void> {
  await Promise.all(nodes.map((node) => client.upsertNode(node)));
}

describe('In-memory ingestion supersession jobs', () => {
  it('supersedes only matching relationships in the incoming relationship tenant', async () => {
    const client = new Neo4jClient({ uri: '' });
    const tenantId = `relationship-job-${crypto.randomUUID()}`;
    const otherTenantId = `relationship-job-${crypto.randomUUID()}`;
    const oldRelationship = makeRelationship(tenantId, 'account', 'owner');
    const otherTenantRelationship = makeRelationship(otherTenantId, 'account', 'owner');
    const incomingRelationship = makeRelationship(tenantId, 'account', 'owner', {
      valid_from: '2026-02-01T00:00:00.000Z',
      recorded_from: '2026-02-02T00:00:00.000Z',
    });

    try {
      await Promise.all([
        client.upsertRelationship(oldRelationship),
        client.upsertRelationship(otherTenantRelationship),
      ]);
      vi.spyOn(client, 'getInMemoryRelationships').mockImplementation(() => {
        throw new Error('getInMemoryRelationships must not be used by ingestion jobs');
      });

      await new RelationUpsertJob(client).upsertRelationship(incomingRelationship);

      expect(await client.listRelationships(tenantId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: oldRelationship.id,
            status: 'superseded',
            valid_to: incomingRelationship.valid_from,
            recorded_to: incomingRelationship.recorded_from,
          }),
          expect.objectContaining({
            id: incomingRelationship.id,
            status: 'current',
          }),
        ]),
      );
      expect(await client.listRelationships(otherTenantId)).toEqual([
        expect.objectContaining({
          id: otherTenantRelationship.id,
          status: 'current',
          valid_to: null,
          recorded_to: null,
        }),
      ]);
    } finally {
      await client.close();
    }
  });

  it('persists fact supersession and contradiction without reading private memory maps', async () => {
    const client = new Neo4jClient({ uri: '' });
    const tenantId = `fact-job-${crypto.randomUUID()}`;
    const otherTenantId = `fact-job-${crypto.randomUUID()}`;
    const supersededFact = makeFact(
      tenantId,
      'account',
      'crm-source',
      'account_tier',
      'standard',
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
    );
    const otherTenantFact = makeFact(
      otherTenantId,
      'account',
      'crm-source',
      'account_tier',
      'standard',
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
    );
    const newerFact = makeFact(
      tenantId,
      'account',
      'support-source',
      'account_tier',
      'enterprise',
      '2026-02-01T00:00:00.000Z',
      '2026-02-02T00:00:00.000Z',
    );
    const contradictedFact = makeFact(
      tenantId,
      'account',
      'crm-source',
      'renewal_status',
      'approved',
      '2026-03-01T00:00:00.000Z',
      '2026-03-02T00:00:00.000Z',
    );
    const conflictingFact = makeFact(
      tenantId,
      'account',
      'support-source',
      'renewal_status',
      'rejected',
      '2026-03-01T00:00:00.000Z',
      '2026-03-03T00:00:00.000Z',
    );

    try {
      await Promise.all([
        client.upsertFact(supersededFact),
        client.upsertFact(otherTenantFact),
        client.upsertFact(contradictedFact),
      ]);
      vi.spyOn(client, 'getInMemoryFacts').mockImplementation(() => {
        throw new Error('getInMemoryFacts must not be used by ingestion jobs');
      });

      const job = new SupersessionDetectionJob(client);
      await job.detectSupersession(newerFact);
      await job.detectSupersession(conflictingFact);

      const facts = await client.listFacts(tenantId);
      expect(facts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: supersededFact.id,
            status: 'superseded',
            valid_to: newerFact.valid_from,
            recorded_to: newerFact.recorded_from,
          }),
          expect.objectContaining({ id: newerFact.id, status: 'current' }),
          expect.objectContaining({ id: contradictedFact.id, status: 'contradicted' }),
          expect.objectContaining({ id: conflictingFact.id, status: 'contradicted' }),
        ]),
      );
      expect(await client.listRelationships(tenantId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'FACT_SUPERSEDES_FACT',
            source_node_id: newerFact.id,
            target_node_id: supersededFact.id,
          }),
          expect.objectContaining({
            type: 'FACT_CONTRADICTS_FACT',
            source_node_id: conflictingFact.id,
            target_node_id: contradictedFact.id,
          }),
        ]),
      );
      expect(await client.listFacts(otherTenantId)).toEqual([
        expect.objectContaining({
          id: otherTenantFact.id,
          status: 'current',
          valid_to: null,
          recorded_to: null,
        }),
      ]);
    } finally {
      await client.close();
    }
  });
});

describeNeo4j('Neo4j ingestion supersession jobs contract', () => {
  it('persists relationship supersession and fact supersession/contradiction', async () => {
    const client = new Neo4jClient({
      uri,
      user: process.env.TEST_NEO4J_USER ?? 'neo4j',
      password: process.env.TEST_NEO4J_PASSWORD ?? 'test-password',
    });
    const tenantId = `ingestion-jobs-${crypto.randomUUID()}`;
    const otherTenantId = `ingestion-jobs-${crypto.randomUUID()}`;
    const account = makeNode(tenantId, 'Account', 'Primary account');
    const owner = makeNode(tenantId, 'Person', 'Primary owner');
    const crmSource = makeNode(tenantId, 'Source', 'CRM source');
    const supportSource = makeNode(tenantId, 'Source', 'Support source');
    const otherAccount = makeNode(otherTenantId, 'Account', 'Other account');
    const otherOwner = makeNode(otherTenantId, 'Person', 'Other owner');
    const otherSource = makeNode(otherTenantId, 'Source', 'Other source');
    const oldRelationship = makeRelationship(tenantId, account.id, owner.id);
    const otherTenantRelationship = makeRelationship(otherTenantId, otherAccount.id, otherOwner.id);
    const incomingRelationship = makeRelationship(tenantId, account.id, owner.id, {
      valid_from: '2026-02-01T00:00:00.000Z',
      recorded_from: '2026-02-02T00:00:00.000Z',
    });
    const supersededFact = makeFact(
      tenantId,
      account.id,
      crmSource.id,
      'account_tier',
      'standard',
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
    );
    const otherTenantFact = makeFact(
      otherTenantId,
      otherAccount.id,
      otherSource.id,
      'account_tier',
      'standard',
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
    );
    const newerFact = makeFact(
      tenantId,
      account.id,
      supportSource.id,
      'account_tier',
      'enterprise',
      '2026-02-01T00:00:00.000Z',
      '2026-02-02T00:00:00.000Z',
    );
    const contradictedFact = makeFact(
      tenantId,
      account.id,
      crmSource.id,
      'renewal_status',
      'approved',
      '2026-03-01T00:00:00.000Z',
      '2026-03-02T00:00:00.000Z',
    );
    const conflictingFact = makeFact(
      tenantId,
      account.id,
      supportSource.id,
      'renewal_status',
      'rejected',
      '2026-03-01T00:00:00.000Z',
      '2026-03-03T00:00:00.000Z',
    );

    try {
      await seedNodes(client, [
        account,
        owner,
        crmSource,
        supportSource,
        otherAccount,
        otherOwner,
        otherSource,
      ]);
      await Promise.all([
        client.upsertRelationship(oldRelationship),
        client.upsertRelationship(otherTenantRelationship),
        client.upsertFact(supersededFact),
        client.upsertFact(otherTenantFact),
        client.upsertFact(contradictedFact),
      ]);

      await new RelationUpsertJob(client).upsertRelationship(incomingRelationship);
      const factJob = new SupersessionDetectionJob(client);
      await factJob.detectSupersession(newerFact);
      await factJob.detectSupersession(conflictingFact);

      expect(await client.listRelationships(tenantId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: oldRelationship.id,
            status: 'superseded',
            valid_to: incomingRelationship.valid_from,
            recorded_to: incomingRelationship.recorded_from,
          }),
          expect.objectContaining({ id: incomingRelationship.id, status: 'current' }),
          expect.objectContaining({
            type: 'FACT_SUPERSEDES_FACT',
            source_node_id: newerFact.id,
            target_node_id: supersededFact.id,
          }),
          expect.objectContaining({
            type: 'FACT_CONTRADICTS_FACT',
            source_node_id: conflictingFact.id,
            target_node_id: contradictedFact.id,
          }),
        ]),
      );
      expect(await client.listFacts(tenantId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: supersededFact.id,
            status: 'superseded',
            valid_to: newerFact.valid_from,
            recorded_to: newerFact.recorded_from,
          }),
          expect.objectContaining({ id: newerFact.id, status: 'current' }),
          expect.objectContaining({ id: contradictedFact.id, status: 'contradicted' }),
          expect.objectContaining({ id: conflictingFact.id, status: 'contradicted' }),
        ]),
      );
      expect(await client.listRelationships(otherTenantId)).toEqual([
        expect.objectContaining({ id: otherTenantRelationship.id, status: 'current' }),
      ]);
      expect(await client.listFacts(otherTenantId)).toEqual([
        expect.objectContaining({ id: otherTenantFact.id, status: 'current' }),
      ]);
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
