import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { graphService } from '../src/services/GraphService.js';
import { neo4jClient } from '../src/infra/neo4j.client.js';
import { postgresClient } from '../src/infra/postgres.client.js';
import { GraphNode } from '../src/domain/entities.js';
import { GraphRelationship } from '../src/domain/relationships.js';
import { Fact } from '../src/domain/facts.js';
import crypto from 'node:crypto';

describe('GraphService & Temporal trust layer tests', () => {
  beforeEach(async () => {
    await neo4jClient.clear();
    await graphService.clearSearchIndex();
  });

  afterAll(async () => {
    await neo4jClient.close();
    await postgresClient.close();
  });

  it('should ingest nodes and query them via simulated Cypher', async () => {
    const tenantId = 'org_test_123';
    const personId = crypto.randomUUID();
    const projectId = crypto.randomUUID();

    const personNode: GraphNode = {
      id: personId,
      tenant_id: tenantId,
      type: 'Person',
      canonical_name: 'John Doe',
      aliases: ['jdoe'],
      source_system: 'github',
      source_id: 'gh_john',
      confidence: 0.95,
      status: 'current',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      valid_from: new Date().toISOString(),
      valid_to: null,
      recorded_from: new Date().toISOString(),
      recorded_to: null,
      last_seen_at: new Date().toISOString(),
      permissions_hash: 'perm1',
      source_url: 'http://github.com/jdoe',
      properties: {},
    };

    const projectNode: GraphNode = {
      id: projectId,
      tenant_id: tenantId,
      type: 'Project',
      canonical_name: 'Project Atlas',
      aliases: ['Atlas Migration'],
      source_system: 'notion',
      source_id: 'notion_atlas',
      confidence: 0.9,
      status: 'current',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      valid_from: new Date().toISOString(),
      valid_to: null,
      recorded_from: new Date().toISOString(),
      recorded_to: null,
      last_seen_at: new Date().toISOString(),
      permissions_hash: 'perm1',
      source_url: 'http://notion.so/atlas',
      properties: {},
    };

    await graphService.ingestNode(personNode);
    await graphService.ingestNode(projectNode);

    const rel: GraphRelationship = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      type: 'PERSON_OWNS_PROJECT',
      source_node_id: personId,
      target_node_id: projectId,
      confidence: 0.85,
      evidence_source_ids: ['src_doc_1'],
      extraction_method: 'llm',
      valid_from: new Date().toISOString(),
      valid_to: null,
      recorded_from: new Date().toISOString(),
      recorded_to: null,
      status: 'current',
      correction_state: 'uncorrected',
      properties: {},
    };

    await graphService.ingestRelationship(rel);

    // Query project owner using the specific project owner Cypher query pattern
    const owners = await graphService.runCypher(
      `
      MATCH (p:Person)-[r:PERSON_OWNS_PROJECT]->(proj:Project)
      WHERE proj.canonical_name = $project_name
        AND r.valid_to IS NULL
        AND r.recorded_to IS NULL
        AND r.status = "current"
      RETURN p, r, proj
      ORDER BY r.confidence DESC
      LIMIT 5
      `,
      { project_name: 'Project Atlas' },
    );

    expect(owners).toHaveLength(1);
    expect(owners[0].p.canonical_name).toBe('John Doe');
    expect(owners[0].proj.canonical_name).toBe('Project Atlas');
  });

  it('should detect bitemporal fact supersessions and update status', async () => {
    const tenantId = 'org_test_123';
    const projectId = crypto.randomUUID();
    const sourceId1 = 'doc_june1';
    const sourceId2 = 'doc_june7';

    // Source 1 asserts launch date is July 15
    const fact1: Fact = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      entity_id: projectId,
      predicate: 'deadline',
      value: '2026-07-15',
      confidence: 0.8,
      status: 'current',
      valid_from: '2026-06-01T00:00:00Z',
      valid_to: null,
      recorded_from: '2026-06-02T10:00:00Z',
      recorded_to: null,
      source_id: sourceId1,
      evidence_spans: ['Launch date is July 15'],
      last_seen_at: new Date().toISOString(),
    };

    await graphService.ingestFact(fact1);

    // Verify current facts
    let currentFacts = await graphService.getFactsCurrent(projectId, tenantId);
    expect(currentFacts).toHaveLength(1);
    expect(currentFacts[0].value).toBe('2026-07-15');

    // Source 2 (newer) asserts launch date is August 1
    const fact2: Fact = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      entity_id: projectId,
      predicate: 'deadline',
      value: '2026-08-01',
      confidence: 0.9,
      status: 'current',
      valid_from: '2026-06-07T00:00:00Z',
      valid_to: null,
      recorded_from: '2026-06-08T10:00:00Z',
      recorded_to: null,
      source_id: sourceId2,
      evidence_spans: ['Launch date moved to August 1'],
      last_seen_at: new Date().toISOString(),
    };

    // We pass source weights: source 2 has higher authority (roadmap meeting note vs old chat message)
    await graphService.ingestFact(fact2, { [sourceId1]: 0.5, [sourceId2]: 0.8 });

    // Verify the old fact is superseded and has a valid_to date matching new fact's valid_from
    const historyFacts = await graphService.getFactsHistory(projectId, tenantId);
    expect(historyFacts).toHaveLength(2);

    const oldFactStored = historyFacts.find((f) => f.id === fact1.id)!;
    expect(oldFactStored.status).toBe('superseded');
    expect(oldFactStored.valid_to).toBe(fact2.valid_from);
    expect(oldFactStored.recorded_to).toBe(fact2.recorded_from);

    // Verify only the new fact is current
    currentFacts = await graphService.getFactsCurrent(projectId, tenantId);
    expect(currentFacts).toHaveLength(1);
    expect(currentFacts[0].value).toBe('2026-08-01');

    // Verify temporal as-of queries
    const factsAsOfJune5 = await graphService.getFactsAsOf(
      projectId,
      tenantId,
      '2026-06-05T00:00:00Z',
    );
    expect(factsAsOfJune5).toHaveLength(1);
    expect(factsAsOfJune5[0].value).toBe('2026-07-15');

    const factsAsOfJune10 = await graphService.getFactsAsOf(
      projectId,
      tenantId,
      '2026-06-10T00:00:00Z',
    );
    expect(factsAsOfJune10).toHaveLength(1);
    expect(factsAsOfJune10[0].value).toBe('2026-08-01');
  });

  it('should handle contradiction when two authoritative facts overlap', async () => {
    const tenantId = 'org_test_123';
    const projectId = crypto.randomUUID();

    const fact1: Fact = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      entity_id: projectId,
      predicate: 'deadline',
      value: '2026-08-01',
      confidence: 0.85,
      status: 'current',
      valid_from: '2026-06-07T00:00:00Z',
      valid_to: null,
      recorded_from: '2026-06-08T10:00:00Z',
      recorded_to: null,
      source_id: 'notion_roadmap',
      evidence_spans: ['August 1 on Notion'],
      last_seen_at: new Date().toISOString(),
    };

    const fact2: Fact = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      entity_id: projectId,
      predicate: 'deadline',
      value: '2026-08-10',
      confidence: 0.85,
      status: 'current',
      valid_from: '2026-06-07T00:00:00Z', // Same time
      valid_to: null,
      recorded_from: '2026-06-08T10:00:00Z',
      recorded_to: null,
      source_id: 'slack_chat',
      evidence_spans: ['August 10 on Slack'],
      last_seen_at: new Date().toISOString(),
    };

    await graphService.ingestFact(fact1, { notion_roadmap: 0.8, slack_chat: 0.8 });
    await graphService.ingestFact(fact2, { notion_roadmap: 0.8, slack_chat: 0.8 });

    const conflicts = await graphService.getFactsConflicts(projectId, tenantId);
    expect(conflicts).toHaveLength(2);
    expect(conflicts.map((f) => f.value)).toContain('2026-08-01');
    expect(conflicts.map((f) => f.value)).toContain('2026-08-10');
  });

  it('should process human corrections', async () => {
    const tenantId = 'org_test_123';
    const projectId = crypto.randomUUID();
    const factId = crypto.randomUUID();

    const fact: Fact = {
      id: factId,
      tenant_id: tenantId,
      entity_id: projectId,
      predicate: 'deadline',
      value: '2026-07-15',
      confidence: 0.8,
      status: 'current',
      valid_from: '2026-06-01T00:00:00Z',
      valid_to: null,
      recorded_from: '2026-06-02T10:00:00Z',
      recorded_to: null,
      source_id: 'slack',
      evidence_spans: ['Let us launch on July 15'],
      last_seen_at: new Date().toISOString(),
    };

    await graphService.ingestFact(fact);

    // Apply FACT_UPDATE correction
    const correctionResult = await graphService.applyCorrection({
      tenant_id: tenantId,
      user_id: 'user_admin',
      correction_type: 'FACT_UPDATE',
      target_type: 'fact',
      target_id: factId,
      reason: 'Launch moved to August 1 officially',
      new_value: {
        predicate: 'deadline',
        value: '2026-08-01',
      },
    });

    expect(correctionResult.status).toBe('applied');

    // Verify old fact is superseded and a new corrected fact exists
    const currentFacts = await graphService.getFactsCurrent(projectId, tenantId);
    expect(currentFacts).toHaveLength(1);
    expect(currentFacts[0].value).toBe('2026-08-01');
    expect(currentFacts[0].confidence).toBe(1.0); // Human correction absolute trust

    // Invalidate fact
    const invalidateResult = await graphService.applyCorrection({
      tenant_id: tenantId,
      user_id: 'user_admin',
      correction_type: 'FACT_INVALIDATE',
      target_type: 'fact',
      target_id: currentFacts[0].id,
      reason: 'No longer setting a public deadline',
    });

    expect(invalidateResult.status).toBe('applied');
    const finalFacts = await graphService.getFactsCurrent(projectId, tenantId);
    expect(finalFacts).toHaveLength(0); // Fact is invalidated, should not be returned as current
  });

  it('should merge entities and update aliases', async () => {
    const tenantId = 'org_test_123';
    const idA = crypto.randomUUID();
    const idB = crypto.randomUUID();

    const nodeA: GraphNode = {
      id: idA,
      tenant_id: tenantId,
      type: 'Project',
      canonical_name: 'Project Atlas',
      aliases: [],
      source_system: 'notion',
      source_id: 'notion_a',
      confidence: 0.9,
      status: 'current',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      valid_from: new Date().toISOString(),
      valid_to: null,
      recorded_from: new Date().toISOString(),
      recorded_to: null,
      last_seen_at: new Date().toISOString(),
      permissions_hash: null,
      source_url: null,
      properties: {},
    };

    const nodeB: GraphNode = {
      id: idB,
      tenant_id: tenantId,
      type: 'Project',
      canonical_name: 'Atlas Migration',
      aliases: [],
      source_system: 'github',
      source_id: 'git_b',
      confidence: 0.9,
      status: 'current',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      valid_from: new Date().toISOString(),
      valid_to: null,
      recorded_from: new Date().toISOString(),
      recorded_to: null,
      last_seen_at: new Date().toISOString(),
      permissions_hash: null,
      source_url: null,
      properties: {},
    };

    await graphService.ingestNode(nodeA);
    await graphService.ingestNode(nodeB);

    // Apply entity merge correction (merge Atlas Migration (nodeB) into Project Atlas (nodeA))
    await graphService.applyCorrection({
      tenant_id: tenantId,
      user_id: 'user_admin',
      correction_type: 'ENTITY_MERGE',
      target_type: 'entity',
      target_id: idB,
      new_value: {
        canonical_entity_id: idA,
      },
    });

    const updatedNodeA = neo4jClient.getInMemoryNodes().get(idA)!;
    const updatedNodeB = neo4jClient.getInMemoryNodes().get(idB)!;

    expect(updatedNodeA.aliases).toContain('Atlas Migration');
    expect(updatedNodeB.status).toBe('superseded');
  });

  it('should perform tenant-isolated, permission-aware vector search', async () => {
    const allowedTenant = 'org_allowed';
    const otherTenant = 'org_other';
    const now = new Date().toISOString();

    const publicProject: GraphNode = {
      id: crypto.randomUUID(),
      tenant_id: allowedTenant,
      type: 'Project',
      canonical_name: 'Atlas database migration',
      aliases: ['Postgres modernization'],
      source_system: 'notion',
      source_id: 'atlas-public',
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
    const restrictedProject: GraphNode = {
      ...publicProject,
      id: crypto.randomUUID(),
      canonical_name: 'Secret acquisition plan',
      aliases: [],
      source_id: 'secret-plan',
      permissions_hash: 'executive',
    };
    const otherTenantProject: GraphNode = {
      ...publicProject,
      id: crypto.randomUUID(),
      tenant_id: otherTenant,
      canonical_name: 'Atlas database migration confidential',
      source_id: 'other-atlas',
    };

    await graphService.ingestNode(publicProject);
    await graphService.ingestNode(restrictedProject);
    await graphService.ingestNode(otherTenantProject);

    const publicResults = await graphService.search(allowedTenant, 'database migration', {
      minScore: 0.1,
    });
    expect(publicResults.map((hit) => hit.document.resourceId)).toContain(publicProject.id);
    expect(publicResults.map((hit) => hit.document.resourceId)).not.toContain(
      otherTenantProject.id,
    );

    const deniedResults = await graphService.search(allowedTenant, 'secret acquisition');
    expect(deniedResults.map((hit) => hit.document.resourceId)).not.toContain(restrictedProject.id);

    const allowedResults = await graphService.search(allowedTenant, 'secret acquisition', {
      allowedPermissionHashes: ['executive'],
    });
    expect(allowedResults[0].document.resourceId).toBe(restrictedProject.id);
  });

  it('should normalize schema-defaulted node fields at the service boundary', async () => {
    const now = new Date().toISOString();
    const node = {
      id: crypto.randomUUID(),
      tenant_id: 'org_defaults',
      type: 'Document',
      canonical_name: 'Minimal REST document',
      source_system: 'api',
      source_id: 'minimal-rest-document',
      confidence: 0.9,
      status: 'current',
      created_at: now,
      updated_at: now,
      valid_from: now,
      valid_to: null,
      recorded_from: now,
      recorded_to: null,
      last_seen_at: now,
    } as GraphNode;

    await graphService.ingestNode(node);
    const results = await graphService.search('org_defaults', 'minimal REST document');
    expect(results[0]?.document.resourceId).toBe(node.id);
    expect(node.aliases).toEqual([]);
    expect(node.properties).toEqual({});
  });

  it('should index current facts and remove superseded facts from vector search', async () => {
    const tenantId = 'org_search';
    const entityId = crypto.randomUUID();
    const now = new Date().toISOString();
    const sourceBase: GraphNode = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      type: 'Source',
      canonical_name: 'Roadmap',
      aliases: [],
      source_system: 'notion',
      source_id: 'roadmap-old',
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
    await graphService.ingestNode(sourceBase);
    await graphService.ingestNode({
      ...sourceBase,
      id: crypto.randomUUID(),
      source_id: 'roadmap-new',
    });

    const firstFact: Fact = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      entity_id: entityId,
      predicate: 'launch deadline',
      value: 'July 15',
      confidence: 0.8,
      status: 'current',
      valid_from: '2026-06-01T00:00:00Z',
      valid_to: null,
      recorded_from: '2026-06-02T00:00:00Z',
      recorded_to: null,
      source_id: 'roadmap-old',
      evidence_spans: ['Launch deadline is July 15'],
      last_seen_at: now,
    };
    const secondFact: Fact = {
      ...firstFact,
      id: crypto.randomUUID(),
      value: 'August 1',
      confidence: 0.95,
      valid_from: '2026-06-10T00:00:00Z',
      recorded_from: '2026-06-11T00:00:00Z',
      source_id: 'roadmap-new',
      evidence_spans: ['Launch deadline moved to August 1'],
    };

    await graphService.ingestFact(firstFact, { 'roadmap-old': 0.5 });
    await graphService.ingestFact(secondFact, { 'roadmap-old': 0.5, 'roadmap-new': 0.9 });

    const results = await graphService.search(tenantId, 'launch deadline August', {
      resourceTypes: ['Fact'],
      minScore: 0.1,
    });
    expect(results.map((hit) => hit.document.resourceId)).toContain(secondFact.id);
    expect(results.map((hit) => hit.document.resourceId)).not.toContain(firstFact.id);
  });
});
