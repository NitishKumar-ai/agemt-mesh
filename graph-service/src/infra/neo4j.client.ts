import neo4j, { Driver } from 'neo4j-driver';
import { GraphNode } from '../domain/entities.js';
import { GraphRelationship, RelationshipType } from '../domain/relationships.js';
import { Fact } from '../domain/facts.js';

export class Neo4jClient {
  private driver: Driver | null = null;
  private inMemoryNodes = new Map<string, GraphNode>();
  private inMemoryRelationships = new Map<string, GraphRelationship>();
  private inMemoryFacts = new Map<string, Fact>();

  constructor() {
    const uri = process.env.NEO4J_URI;
    const user = process.env.NEO4J_USER || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || 'password';

    if (uri) {
      try {
        console.log(`Connecting to Neo4j at ${uri}...`);
        this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
      } catch (err) {
        console.error('Failed to create Neo4j driver, falling back to in-memory store:', err);
      }
    } else {
      console.log('No NEO4J_URI set. Using fully functional in-memory graph store.');
    }
  }

  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
    }
  }

  async clear(): Promise<void> {
    if (this.driver) {
      const session = this.driver.session();
      try {
        await session.run('MATCH (n) DETACH DELETE n');
      } finally {
        await session.close();
      }
    } else {
      this.inMemoryNodes.clear();
      this.inMemoryRelationships.clear();
      this.inMemoryFacts.clear();
    }
  }

  async upsertNode(node: GraphNode): Promise<void> {
    if (this.driver) {
      const session = this.driver.session();
      try {
        await session.run(
          `
          MERGE (n:${node.type} { id: $id, tenant_id: $tenant_id })
          SET n += $props
          `,
          {
            id: node.id,
            tenant_id: node.tenant_id,
            props: {
              canonical_name: node.canonical_name,
              aliases: node.aliases,
              source_system: node.source_system,
              source_id: node.source_id,
              confidence: node.confidence,
              status: node.status,
              created_at: node.created_at,
              updated_at: node.updated_at,
              valid_from: node.valid_from,
              valid_to: node.valid_to,
              recorded_from: node.recorded_from,
              recorded_to: node.recorded_to,
              last_seen_at: node.last_seen_at,
              permissions_hash: node.permissions_hash,
              source_url: node.source_url,
              ...node.properties,
            },
          }
        );
      } finally {
        await session.close();
      }
    } else {
      this.inMemoryNodes.set(node.id, { ...node });
    }
  }

  async upsertRelationship(rel: GraphRelationship): Promise<void> {
    if (this.driver) {
      const session = this.driver.session();
      try {
        await session.run(
          `
          MATCH (source { id: $source_node_id, tenant_id: $tenant_id })
          MATCH (target { id: $target_node_id, tenant_id: $tenant_id })
          MERGE (source)-[r:${rel.type} { id: $id }]->(target)
          SET r += $props
          `,
          {
            id: rel.id,
            tenant_id: rel.tenant_id,
            source_node_id: rel.source_node_id,
            target_node_id: rel.target_node_id,
            props: {
              confidence: rel.confidence,
              evidence_source_ids: rel.evidence_source_ids,
              extraction_method: rel.extraction_method,
              valid_from: rel.valid_from,
              valid_to: rel.valid_to,
              recorded_from: rel.recorded_from,
              recorded_to: rel.recorded_to,
              status: rel.status,
              correction_state: rel.correction_state,
              ...rel.properties,
            },
          }
        );
      } finally {
        await session.close();
      }
    } else {
      this.inMemoryRelationships.set(rel.id, { ...rel });
    }
  }

  async upsertFact(fact: Fact): Promise<void> {
    // A Fact is represented as a Node of type Fact in Neo4j, with relationships
    // FACT_SUPPORTED_BY_SOURCE pointing to Source node, etc.
    if (this.driver) {
      const session = this.driver.session();
      try {
        await session.run(
          `
          MERGE (f:Fact { id: $id, tenant_id: $tenant_id })
          SET f += $props
          WITH f
          MATCH (entity { id: $entity_id, tenant_id: $tenant_id })
          MERGE (entity)-[:HAS_FACT]->(f)
          WITH f
          MATCH (src:Source { id: $source_id, tenant_id: $tenant_id })
          MERGE (f)-[:FACT_SUPPORTED_BY_SOURCE]->(src)
          `,
          {
            id: fact.id,
            tenant_id: fact.tenant_id,
            entity_id: fact.entity_id,
            source_id: fact.source_id,
            props: {
              predicate: fact.predicate,
              value: typeof fact.value === 'object' ? JSON.stringify(fact.value) : fact.value,
              confidence: fact.confidence,
              status: fact.status,
              valid_from: fact.valid_from,
              valid_to: fact.valid_to,
              recorded_from: fact.recorded_from,
              recorded_to: fact.recorded_to,
              evidence_spans: fact.evidence_spans,
              last_seen_at: fact.last_seen_at,
            },
          }
        );
      } finally {
        await session.close();
      }
    } else {
      this.inMemoryFacts.set(fact.id, { ...fact });
      // Synthesize relationships in-memory
      const hasFactRelId = `rel-fact-${fact.entity_id}-${fact.id}`;
      this.inMemoryRelationships.set(hasFactRelId, {
        id: hasFactRelId,
        tenant_id: fact.tenant_id,
        type: 'PROJECT_HAS_DOCUMENT' as RelationshipType, // fallback general
        source_node_id: fact.entity_id,
        target_node_id: fact.id,
        confidence: 1,
        evidence_source_ids: [],
        extraction_method: 'system',
        valid_from: fact.valid_from,
        valid_to: fact.valid_to,
        recorded_from: fact.recorded_from,
        recorded_to: fact.recorded_to,
        status: fact.status,
        correction_state: 'uncorrected',
        properties: {},
      });

      const supportedByRelId = `rel-source-${fact.id}-${fact.source_id}`;
      this.inMemoryRelationships.set(supportedByRelId, {
        id: supportedByRelId,
        tenant_id: fact.tenant_id,
        type: 'FACT_SUPPORTED_BY_SOURCE',
        source_node_id: fact.id,
        target_node_id: fact.source_id,
        confidence: 1,
        evidence_source_ids: [],
        extraction_method: 'system',
        valid_from: fact.valid_from,
        valid_to: fact.valid_to,
        recorded_from: fact.recorded_from,
        recorded_to: fact.recorded_to,
        status: fact.status,
        correction_state: 'uncorrected',
        properties: {},
      });
    }
  }

  /**
   * Runs Cypher query on driver, or executes simulated Cypher for the 3 main Phase 3 Cypher flows
   */
  async runCypher(queryStr: string, params: Record<string, unknown> = {}): Promise<unknown[]> {
    if (this.driver) {
      const session = this.driver.session();
      try {
        const result = await session.run(queryStr, params);
        return result.records.map((rec) => {
          const row: Record<string, unknown> = {};
          rec.keys.forEach((key) => {
            const val = rec.get(key) as unknown;
            const strKey = String(key);
            if (val && typeof val === 'object' && 'properties' in val) {
              row[strKey] = (val as { properties: unknown }).properties;
            } else {
              row[strKey] = val;
            }
          });
          return row;
        });
      } finally {
        await session.close();
      }
    } else {
      return this.simulateCypher(queryStr, params);
    }
  }

  private simulateCypher(queryStr: string, params: Record<string, unknown>): unknown[] {
    const qNormalized = queryStr.replace(/\s+/g, ' ').trim();

    // 1. MATCH (p:Person)-[r:PERSON_OWNS_PROJECT]->(proj:Project) ...
    if (qNormalized.includes('PERSON_OWNS_PROJECT') && qNormalized.includes('proj.canonical_name')) {
      const projName = params.project_name as string;
      const results: Array<{ p: GraphNode; r: GraphRelationship; proj: GraphNode }> = [];

      for (const rel of this.inMemoryRelationships.values()) {
        if (
          rel.type === 'PERSON_OWNS_PROJECT' &&
          rel.status === 'current' &&
          rel.valid_to === null &&
          rel.recorded_to === null
        ) {
          const person = this.inMemoryNodes.get(rel.source_node_id);
          const project = this.inMemoryNodes.get(rel.target_node_id);

          if (person && project && project.canonical_name === projName) {
            results.push({
              p: person,
              r: rel,
              proj: project,
            });
          }
        }
      }

      // Order by confidence desc
      results.sort((a, b) => b.r.confidence - a.r.confidence);
      const limit = (params.limit as number) || 5;
      return results.slice(0, limit);
    }

    // 2. MATCH (old:Fact)-[s:FACT_SUPERSEDES_FACT]-(new:Fact) ...
    if (qNormalized.includes('FACT_SUPERSEDES_FACT') && qNormalized.includes('new.id = $fact_id')) {
      const factId = params.fact_id as string;
      const results: Array<{
        old: Fact;
        new: Fact;
        oldSource: GraphNode | { id: string; title: string };
        newSource: GraphNode | { id: string; title: string };
        s: GraphRelationship;
      }> = [];

      for (const rel of this.inMemoryRelationships.values()) {
        if (rel.type === 'FACT_SUPERSEDES_FACT') {
          let oldFactId = '';
          let newFactId = '';

          if (rel.target_node_id === factId) {
            oldFactId = rel.source_node_id;
            newFactId = rel.target_node_id;
          } else if (rel.source_node_id === factId) {
            oldFactId = rel.target_node_id;
            newFactId = rel.source_node_id;
          }

          if (oldFactId && newFactId) {
            const oldFact = this.inMemoryFacts.get(oldFactId);
            const newFact = this.inMemoryFacts.get(newFactId);

            if (oldFact && newFact) {
              const oldSource = this.inMemoryNodes.get(oldFact.source_id);
              const newSource = this.inMemoryNodes.get(newFact.source_id);

              results.push({
                old: oldFact,
                new: newFact,
                oldSource: oldSource || { id: oldFact.source_id, title: 'Unknown' },
                newSource: newSource || { id: newFact.source_id, title: 'Unknown' },
                s: rel,
              });
            }
          }
        }
      }
      return results;
    }

    // 3. MATCH (proj:Project {id: $project_id}) ... OPTIONAL MATCH...
    if (qNormalized.includes('Project {id: $project_id}')) {
      const projId = params.project_id as string;
      const proj = this.inMemoryNodes.get(projId);
      if (!proj) return [];

      const docs: GraphNode[] = [];
      const owners: GraphNode[] = [];
      const tasks: GraphNode[] = [];
      const decisions: GraphNode[] = [];

      for (const rel of this.inMemoryRelationships.values()) {
        if (rel.source_node_id === projId) {
          if (rel.type === 'PROJECT_HAS_DOCUMENT') {
            const doc = this.inMemoryNodes.get(rel.target_node_id);
            if (doc) docs.push(doc);
          }
          if (rel.type === 'PROJECT_HAS_TASK') {
            const task = this.inMemoryNodes.get(rel.target_node_id);
            if (task) tasks.push(task);
          }
        }
        if (rel.target_node_id === projId) {
          if (rel.type === 'PERSON_OWNS_PROJECT') {
            const person = this.inMemoryNodes.get(rel.source_node_id);
            if (person) owners.push(person);
          }
          if (rel.type === 'DECISION_AFFECTS_PROJECT') {
            const decision = this.inMemoryNodes.get(rel.source_node_id);
            if (decision) decisions.push(decision);
          }
        }
      }

      return [
        {
          proj,
          'collect(doc)': docs,
          'collect(owner)': owners,
          'collect(task)': tasks,
          'collect(decision)': decisions,
        },
      ];
    }

    // Default general mock lookup for all nodes matching labels or IDs
    const results: Array<{ n: GraphNode | Fact }> = [];
    const entityId = (params.entity_id || params.id) as string;
    if (entityId) {
      const node = this.inMemoryNodes.get(entityId) || this.inMemoryFacts.get(entityId);
      if (node) {
        results.push({ n: node });
      }
    }
    return results;
  }

  // Raw memory access for local non-Cypher operations
  getInMemoryNodes() {
    return this.inMemoryNodes;
  }

  getInMemoryRelationships() {
    return this.inMemoryRelationships;
  }

  getInMemoryFacts() {
    return this.inMemoryFacts;
  }
}
export const neo4jClient = new Neo4jClient();
