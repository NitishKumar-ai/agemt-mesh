import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { EntityResolutionJob } from '../src/jobs/entity-resolution.job.js';
import { Neo4jClient } from '../src/infra/neo4j.client.js';
import { GraphNode } from '../src/domain/entities.js';
import { Fact } from '../src/domain/facts.js';

function makeNode(overrides: Partial<GraphNode> & { id: string; tenant_id: string }): GraphNode {
  const now = new Date().toISOString();
  return {
    type: 'Person',
    canonical_name: 'Unnamed',
    aliases: [],
    source_system: 'test',
    source_id: overrides.id,
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

describe('EntityResolutionJob', () => {
  let client: Neo4jClient;
  let job: EntityResolutionJob;
  const tenantId = 'org_dedup';

  beforeEach(() => {
    client = new Neo4jClient();
    job = new EntityResolutionJob(client);
  });

  it('auto-merges two nodes with an identical normalized canonical name from different sources', async () => {
    const older = makeNode({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      canonical_name: 'Nitish Kumar',
      source_system: 'slack',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    const newer = makeNode({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      canonical_name: 'nitish   kumar', // different casing/whitespace, different connector
      source_system: 'gdrive',
      created_at: '2026-02-01T00:00:00.000Z',
    });
    await client.upsertNode(older);
    await client.upsertNode(newer);

    const report = await job.resolveEntities(tenantId);

    expect(report.autoMergedCount).toBe(1);
    expect(report.pendingReviewCount).toBe(0);

    const nodes = Array.from(client.getInMemoryNodes().values());
    const canonical = nodes.find((n) => n.id === older.id)!;
    const duplicate = nodes.find((n) => n.id === newer.id)!;
    expect(canonical.status).toBe('current');
    expect(duplicate.status).toBe('superseded');
    expect(canonical.aliases).toContain('nitish   kumar');

    const mergeLink = Array.from(client.getInMemoryRelationships().values()).find(
      (r) => r.type === 'ENTITY_MERGED_INTO',
    );
    expect(mergeLink?.source_node_id).toBe(duplicate.id);
    expect(mergeLink?.target_node_id).toBe(canonical.id);
  });

  it('chooses the earlier-created canonical node even when it was inserted second', async () => {
    const newer = makeNode({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      canonical_name: 'Insertion Order',
      source_system: 'slack',
      created_at: '2026-03-01T00:00:00.000Z',
    });
    const older = makeNode({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      canonical_name: 'Insertion Order',
      source_system: 'gdrive',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    await client.upsertNode(newer);
    await client.upsertNode(older);

    const report = await job.resolveEntities(tenantId);

    expect(report.autoMergedCount).toBe(1);
    expect(client.getInMemoryNodes().get(older.id)?.status).toBe('current');
    expect(client.getInMemoryNodes().get(newer.id)?.status).toBe('superseded');
    const mergeLink = Array.from(client.getInMemoryRelationships().values()).find(
      (relationship) => relationship.type === 'ENTITY_MERGED_INTO',
    );
    expect(mergeLink?.source_node_id).toBe(newer.id);
    expect(mergeLink?.target_node_id).toBe(older.id);
  });

  it('uses aliases consolidated by an earlier merge to resolve a duplicate chain in one run', async () => {
    const canonical = makeNode({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      canonical_name: 'Acme Corporation',
      source_system: 'crm',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    const firstDuplicate = makeNode({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      canonical_name: 'Acme Corporation',
      aliases: ['Acme Holdings'],
      source_system: 'slack',
      created_at: '2026-02-01T00:00:00.000Z',
    });
    const secondDuplicate = makeNode({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      canonical_name: 'Acme Holdings',
      source_system: 'gdrive',
      created_at: '2026-03-01T00:00:00.000Z',
    });
    await client.upsertNode(canonical);
    await client.upsertNode(firstDuplicate);
    await client.upsertNode(secondDuplicate);

    const report = await job.resolveEntities(tenantId);

    expect(report.autoMergedCount).toBe(2);
    expect(client.getInMemoryNodes().get(canonical.id)?.aliases).toContain('Acme Holdings');
    expect(client.getInMemoryNodes().get(firstDuplicate.id)?.status).toBe('superseded');
    expect(client.getInMemoryNodes().get(secondDuplicate.id)?.status).toBe('superseded');
  });

  it('reassigns facts and relationships from the merged-away duplicate onto the canonical node', async () => {
    const canonical = makeNode({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      canonical_name: 'Acme Corp',
      source_system: 'crm',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    const duplicate = makeNode({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      canonical_name: 'acme corp',
      source_system: 'support_tickets',
      created_at: '2026-03-01T00:00:00.000Z',
    });
    await client.upsertNode(canonical);
    await client.upsertNode(duplicate);

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
      source_id: 'ticket_1',
      evidence_spans: [],
      last_seen_at: new Date().toISOString(),
    };
    await client.upsertFact(fact);

    const otherNode = makeNode({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      type: 'Person',
      canonical_name: 'Account Owner',
    });
    await client.upsertNode(otherNode);
    await client.upsertRelationship({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      type: 'ACCOUNT_HAS_OWNER',
      source_node_id: duplicate.id,
      target_node_id: otherNode.id,
      confidence: 0.9,
      evidence_source_ids: [],
      extraction_method: 'test',
      valid_from: null,
      valid_to: null,
      recorded_from: null,
      recorded_to: null,
      status: 'current',
      correction_state: 'uncorrected',
      properties: {},
    });

    await job.resolveEntities(tenantId);

    const reassignedFact = Array.from(client.getInMemoryFacts().values()).find(
      (f) => f.id === fact.id,
    );
    expect(reassignedFact?.entity_id).toBe(canonical.id);

    const reassignedRel = Array.from(client.getInMemoryRelationships().values()).find(
      (r) => r.type === 'ACCOUNT_HAS_OWNER',
    );
    expect(reassignedRel?.source_node_id).toBe(canonical.id);
  });

  it('auto-merges on explicit alias overlap even when canonical names differ', async () => {
    const nodeA = makeNode({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      canonical_name: 'N. Kumar',
      aliases: ['Nitish Kumar'],
      created_at: '2026-01-01T00:00:00.000Z',
    });
    const nodeB = makeNode({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      canonical_name: 'Nitish Kumar',
      created_at: '2026-01-02T00:00:00.000Z',
    });
    await client.upsertNode(nodeA);
    await client.upsertNode(nodeB);

    const report = await job.resolveEntities(tenantId);
    expect(report.autoMergedCount).toBe(1);
  });

  it('only flags a pending-review link for partial name similarity, without merging', async () => {
    const nodeA = makeNode({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      canonical_name: 'Project Falcon Launch',
    });
    const nodeB = makeNode({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      canonical_name: 'Falcon Launch Plan',
    });
    await client.upsertNode(nodeA);
    await client.upsertNode(nodeB);

    const report = await job.resolveEntities(tenantId);
    expect(report.autoMergedCount).toBe(0);
    expect(report.pendingReviewCount).toBe(1);

    const nodes = Array.from(client.getInMemoryNodes().values());
    expect(nodes.find((n) => n.id === nodeA.id)?.status).toBe('current');
    expect(nodes.find((n) => n.id === nodeB.id)?.status).toBe('current');

    const link = Array.from(client.getInMemoryRelationships().values()).find(
      (r) => r.type === 'ENTITY_ALIAS_OF',
    );
    expect(link).toBeTruthy();
  });

  it('does not link or merge unrelated nodes', async () => {
    const nodeA = makeNode({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      canonical_name: 'Project Falcon',
    });
    const nodeB = makeNode({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      canonical_name: 'Quarterly Budget Review',
    });
    await client.upsertNode(nodeA);
    await client.upsertNode(nodeB);

    const report = await job.resolveEntities(tenantId);
    expect(report.resolvedCount).toBe(0);
  });

  it('does not match nodes of different types even with identical names', async () => {
    const personNode = makeNode({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      type: 'Person',
      canonical_name: 'Acme',
    });
    const accountNode = makeNode({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      type: 'Account',
      canonical_name: 'Acme',
    });
    await client.upsertNode(personNode);
    await client.upsertNode(accountNode);

    const report = await job.resolveEntities(tenantId);
    expect(report.resolvedCount).toBe(0);
  });

  it('does not cross tenant boundaries', async () => {
    const nodeA = makeNode({
      id: crypto.randomUUID(),
      tenant_id: 'org_a',
      canonical_name: 'Same Name',
    });
    const nodeB = makeNode({
      id: crypto.randomUUID(),
      tenant_id: 'org_b',
      canonical_name: 'Same Name',
    });
    await client.upsertNode(nodeA);
    await client.upsertNode(nodeB);

    const reportA = await job.resolveEntities('org_a');
    expect(reportA.resolvedCount).toBe(0);
  });

  it('is idempotent: re-running after a merge does not re-link the superseded node', async () => {
    const nodeA = makeNode({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      canonical_name: 'Repeat Run',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    const nodeB = makeNode({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      canonical_name: 'Repeat Run',
      created_at: '2026-01-02T00:00:00.000Z',
    });
    await client.upsertNode(nodeA);
    await client.upsertNode(nodeB);

    const first = await job.resolveEntities(tenantId);
    expect(first.autoMergedCount).toBe(1);

    const second = await job.resolveEntities(tenantId);
    expect(second.resolvedCount).toBe(0);
  });
});
