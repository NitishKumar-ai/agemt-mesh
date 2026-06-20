import neo4j, { Driver } from 'neo4j-driver';
import { GraphNode, NodeTypeEnum } from '../domain/entities.js';
import {
  GraphRelationship,
  RelationshipType,
  RelationshipTypeEnum,
} from '../domain/relationships.js';
import { Fact } from '../domain/facts.js';

export interface Neo4jClientOptions {
  uri?: string;
  user?: string;
  password?: string;
}

export class Neo4jClient {
  private driver: Driver | null = null;
  private inMemoryNodes = new Map<string, GraphNode>();
  private inMemoryRelationships = new Map<string, GraphRelationship>();
  private inMemoryFacts = new Map<string, Fact>();

  constructor(options: Neo4jClientOptions = {}) {
    const uri = options.uri ?? process.env.NEO4J_URI;
    const user = options.user ?? process.env.NEO4J_USER ?? 'neo4j';
    const password = options.password ?? process.env.NEO4J_PASSWORD;

    if (uri) {
      if (!password) {
        throw new Error(
          'NEO4J_PASSWORD must be set when NEO4J_URI is configured. Refusing to connect with a default password.'
        );
      }
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
      const nodeType = NodeTypeEnum.parse(node.type);
      const session = this.driver.session();
      try {
        await session.run(
          `
          MERGE (n:${nodeType} { id: $id, tenant_id: $tenant_id })
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
          },
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
      const relationshipType = RelationshipTypeEnum.parse(rel.type);
      const session = this.driver.session();
      try {
        await session.run(
          `
          MATCH (source { id: $source_node_id, tenant_id: $tenant_id })
          MATCH (target { id: $target_node_id, tenant_id: $tenant_id })
          MERGE (source)-[r:${relationshipType} { id: $id }]->(target)
          SET r += $props
          `,
          {
            id: rel.id,
            tenant_id: rel.tenant_id,
            source_node_id: rel.source_node_id,
            target_node_id: rel.target_node_id,
            props: {
              tenant_id: rel.tenant_id,
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
          },
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
              entity_id: fact.entity_id,
              source_id: fact.source_id,
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
          },
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

  async listNodes(tenantId?: string): Promise<GraphNode[]> {
    if (!this.driver) {
      return Array.from(this.inMemoryNodes.values())
        .filter((node) => !tenantId || node.tenant_id === tenantId)
        .map((node) => this.cloneNode(node));
    }

    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (n)
         WHERE NOT n:Fact AND ($tenant_id IS NULL OR n.tenant_id = $tenant_id)
         RETURN n, labels(n) AS labels`,
        { tenant_id: tenantId ?? null },
      );
      return result.records.map((record) =>
        this.nodeFromRecord(record.get('n'), record.get('labels')),
      );
    } finally {
      await session.close();
    }
  }

  async getNode(id: string, tenantId: string): Promise<GraphNode | undefined> {
    if (!this.driver) {
      const node = this.inMemoryNodes.get(id);
      return node?.tenant_id === tenantId ? this.cloneNode(node) : undefined;
    }

    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (n {id: $id, tenant_id: $tenant_id})
         WHERE NOT n:Fact
         RETURN n, labels(n) AS labels
         LIMIT 1`,
        { id, tenant_id: tenantId },
      );
      const record = result.records[0];
      return record ? this.nodeFromRecord(record.get('n'), record.get('labels')) : undefined;
    } finally {
      await session.close();
    }
  }

  async listFacts(tenantId?: string): Promise<Fact[]> {
    if (!this.driver) {
      return Array.from(this.inMemoryFacts.values())
        .filter((fact) => !tenantId || fact.tenant_id === tenantId)
        .map((fact) => this.cloneFact(fact));
    }

    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (f:Fact)
         WHERE $tenant_id IS NULL OR f.tenant_id = $tenant_id
         OPTIONAL MATCH (entity)-[:HAS_FACT]->(f)
         WHERE entity.tenant_id = f.tenant_id
         WITH f, head(collect(DISTINCT entity.id)) AS linked_entity_id
         OPTIONAL MATCH (f)-[:FACT_SUPPORTED_BY_SOURCE]->(source:Source)
         WHERE source.tenant_id = f.tenant_id
         RETURN f,
                coalesce(f.entity_id, linked_entity_id) AS entity_id,
                coalesce(f.source_id, head(collect(DISTINCT source.id))) AS source_id`,
        { tenant_id: tenantId ?? null },
      );
      return result.records.map((record) =>
        this.factFromRecord(record.get('f'), record.get('entity_id'), record.get('source_id')),
      );
    } finally {
      await session.close();
    }
  }

  async getFact(id: string, tenantId: string): Promise<Fact | undefined> {
    if (!this.driver) {
      const fact = this.inMemoryFacts.get(id);
      return fact?.tenant_id === tenantId ? this.cloneFact(fact) : undefined;
    }

    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (f:Fact {id: $id, tenant_id: $tenant_id})
         OPTIONAL MATCH (entity)-[:HAS_FACT]->(f)
         WHERE entity.tenant_id = f.tenant_id
         WITH f, head(collect(DISTINCT entity.id)) AS linked_entity_id
         OPTIONAL MATCH (f)-[:FACT_SUPPORTED_BY_SOURCE]->(source:Source)
         WHERE source.tenant_id = f.tenant_id
         RETURN f,
                coalesce(f.entity_id, linked_entity_id) AS entity_id,
                coalesce(f.source_id, head(collect(DISTINCT source.id))) AS source_id
         LIMIT 1`,
        { id, tenant_id: tenantId },
      );
      const record = result.records[0];
      return record
        ? this.factFromRecord(record.get('f'), record.get('entity_id'), record.get('source_id'))
        : undefined;
    } finally {
      await session.close();
    }
  }

  async listRelationships(tenantId?: string): Promise<GraphRelationship[]> {
    if (!this.driver) {
      return Array.from(this.inMemoryRelationships.entries())
        .filter(([id, rel]) => {
          return !this.isSyntheticFactEdge(id) && (!tenantId || rel.tenant_id === tenantId);
        })
        .map(([, rel]) => this.cloneRelationship(rel));
    }

    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (source)-[r]->(target)
         WHERE r.id IS NOT NULL
           AND source.tenant_id = target.tenant_id
           AND ($tenant_id IS NULL OR (
             source.tenant_id = $tenant_id
             AND coalesce(r.tenant_id, source.tenant_id) = $tenant_id
           ))
         RETURN r, type(r) AS relationship_type,
                source.id AS source_node_id, target.id AS target_node_id,
                source.tenant_id AS tenant_id`,
        { tenant_id: tenantId ?? null },
      );
      return result.records.map((record) =>
        this.relationshipFromRecord(
          record.get('r'),
          record.get('relationship_type'),
          record.get('source_node_id'),
          record.get('target_node_id'),
          record.get('tenant_id'),
        ),
      );
    } finally {
      await session.close();
    }
  }

  async getRelationship(id: string, tenantId: string): Promise<GraphRelationship | undefined> {
    if (!this.driver) {
      const relationship = this.inMemoryRelationships.get(id);
      return relationship?.tenant_id === tenantId && !this.isSyntheticFactEdge(id)
        ? this.cloneRelationship(relationship)
        : undefined;
    }

    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (source)-[r]->(target)
         WHERE r.id = $id
           AND source.tenant_id = $tenant_id
           AND target.tenant_id = $tenant_id
           AND coalesce(r.tenant_id, source.tenant_id) = $tenant_id
         RETURN r, type(r) AS relationship_type,
                source.id AS source_node_id, target.id AS target_node_id,
                source.tenant_id AS tenant_id
         LIMIT 1`,
        { id, tenant_id: tenantId },
      );
      const record = result.records[0];
      return record
        ? this.relationshipFromRecord(
            record.get('r'),
            record.get('relationship_type'),
            record.get('source_node_id'),
            record.get('target_node_id'),
            record.get('tenant_id'),
          )
        : undefined;
    } finally {
      await session.close();
    }
  }

  async reassignFact(
    factId: string,
    tenantId: string,
    newEntityId: string,
    now = new Date().toISOString(),
  ): Promise<Fact | undefined> {
    if (!this.driver) {
      const fact = this.inMemoryFacts.get(factId);
      const newEntity = this.inMemoryNodes.get(newEntityId);
      if (fact?.tenant_id !== tenantId || newEntity?.tenant_id !== tenantId) return undefined;

      for (const [relationshipId, relationship] of this.inMemoryRelationships) {
        if (
          this.isSyntheticFactEdge(relationshipId) &&
          relationship.tenant_id === tenantId &&
          relationship.target_node_id === factId
        ) {
          this.inMemoryRelationships.delete(relationshipId);
        }
      }

      const updatedFact: Fact = { ...fact, entity_id: newEntityId, last_seen_at: now };
      this.inMemoryFacts.set(factId, updatedFact);
      const relationshipId = `rel-fact-${newEntityId}-${factId}`;
      this.inMemoryRelationships.set(relationshipId, {
        id: relationshipId,
        tenant_id: tenantId,
        type: 'PROJECT_HAS_DOCUMENT',
        source_node_id: newEntityId,
        target_node_id: factId,
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
      return this.cloneFact(updatedFact);
    }

    const session = this.driver.session();
    try {
      const result = await session.executeWrite((transaction) =>
        transaction.run(
          `MATCH (f:Fact {id: $fact_id, tenant_id: $tenant_id})
           MATCH (new_entity {id: $new_entity_id, tenant_id: $tenant_id})
           OPTIONAL MATCH ()-[old:HAS_FACT]->(f)
           DELETE old
           MERGE (new_entity)-[:HAS_FACT]->(f)
           SET f.entity_id = $new_entity_id,
               f.last_seen_at = $now
           WITH f
           OPTIONAL MATCH (f)-[:FACT_SUPPORTED_BY_SOURCE]->(source:Source)
           WHERE source.tenant_id = f.tenant_id
           RETURN f, f.entity_id AS entity_id,
                  coalesce(f.source_id, head(collect(DISTINCT source.id))) AS source_id`,
          {
            fact_id: factId,
            tenant_id: tenantId,
            new_entity_id: newEntityId,
            now,
          },
        ),
      );
      const record = result.records[0];
      return record
        ? this.factFromRecord(record.get('f'), record.get('entity_id'), record.get('source_id'))
        : undefined;
    } finally {
      await session.close();
    }
  }

  async reassignRelationship(
    relId: string,
    tenantId: string,
    originalNodeId: string,
    newNodeId: string,
  ): Promise<GraphRelationship | undefined> {
    if (!this.driver) {
      const relationship = this.inMemoryRelationships.get(relId);
      const newNode = this.inMemoryNodes.get(newNodeId);
      if (
        !relationship ||
        relationship.tenant_id !== tenantId ||
        this.isSyntheticFactEdge(relId) ||
        newNode?.tenant_id !== tenantId ||
        (relationship.source_node_id !== originalNodeId &&
          relationship.target_node_id !== originalNodeId)
      ) {
        return undefined;
      }

      RelationshipTypeEnum.parse(relationship.type);
      const sourceNodeId =
        relationship.source_node_id === originalNodeId ? newNodeId : relationship.source_node_id;
      const targetNodeId =
        relationship.target_node_id === originalNodeId ? newNodeId : relationship.target_node_id;

      if (sourceNodeId === targetNodeId) {
        this.inMemoryRelationships.delete(relId);
        return undefined;
      }

      const updatedRelationship = {
        ...relationship,
        source_node_id: sourceNodeId,
        target_node_id: targetNodeId,
      };
      this.inMemoryRelationships.set(relId, updatedRelationship);
      return this.cloneRelationship(updatedRelationship);
    }

    const session = this.driver.session();
    try {
      return await session.executeWrite(async (transaction) => {
        const result = await transaction.run(
          `MATCH (source)-[r]->(target)
           MATCH (replacement {id: $new_node_id, tenant_id: $tenant_id})
           WHERE r.id = $rel_id
             AND source.tenant_id = $tenant_id
             AND target.tenant_id = $tenant_id
             AND coalesce(r.tenant_id, source.tenant_id) = $tenant_id
             AND (source.id = $original_node_id OR target.id = $original_node_id)
           RETURN elementId(r) AS element_id, properties(r) AS properties,
                  type(r) AS relationship_type,
                  source.id AS source_node_id, target.id AS target_node_id`,
          {
            rel_id: relId,
            tenant_id: tenantId,
            original_node_id: originalNodeId,
            new_node_id: newNodeId,
          },
        );
        const record = result.records[0];
        if (!record) return undefined;

        const relationshipType = RelationshipTypeEnum.parse(record.get('relationship_type'));
        const sourceNodeId = String(this.toNative(record.get('source_node_id')));
        const targetNodeId = String(this.toNative(record.get('target_node_id')));
        const nextSourceNodeId = sourceNodeId === originalNodeId ? newNodeId : sourceNodeId;
        const nextTargetNodeId = targetNodeId === originalNodeId ? newNodeId : targetNodeId;
        const properties = this.toNative(record.get('properties')) as Record<string, unknown>;

        // Remove every copy of this logical relationship before recreating it so
        // earlier endpoint changes cannot leave stale edges behind.
        await transaction.run(
          `MATCH (source)-[r]->(target)
           WHERE r.id = $rel_id
             AND source.tenant_id = $tenant_id
             AND target.tenant_id = $tenant_id
             AND coalesce(r.tenant_id, source.tenant_id) = $tenant_id
           DELETE r`,
          { rel_id: relId, tenant_id: tenantId },
        );

        if (nextSourceNodeId === nextTargetNodeId) return undefined;

        const replacementResult = await transaction.run(
          `MATCH (source {id: $source_node_id, tenant_id: $tenant_id})
           MATCH (target {id: $target_node_id, tenant_id: $tenant_id})
           CREATE (source)-[replacement:${relationshipType}]->(target)
           SET replacement = $properties
           RETURN replacement AS r, type(replacement) AS relationship_type,
                  source.id AS source_node_id, target.id AS target_node_id,
                  source.tenant_id AS tenant_id`,
          {
            source_node_id: nextSourceNodeId,
            target_node_id: nextTargetNodeId,
            tenant_id: tenantId,
            properties,
          },
        );
        const replacementRecord = replacementResult.records[0];
        return replacementRecord
          ? this.relationshipFromRecord(
              replacementRecord.get('r'),
              replacementRecord.get('relationship_type'),
              replacementRecord.get('source_node_id'),
              replacementRecord.get('target_node_id'),
              replacementRecord.get('tenant_id'),
            )
          : undefined;
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Applies an entity merge as one Neo4j transaction. Endpoint-changing
   * relationships are deleted and recreated because MERGE cannot move an
   * existing relationship to a different pair of nodes.
   */
  async mergeEntities(
    canonical: GraphNode,
    duplicate: GraphNode,
    mergedAliases: string[],
    mergeRelationship: GraphRelationship,
    now: string,
  ): Promise<void> {
    if (!this.driver) {
      this.mergeEntitiesInMemory(canonical, duplicate, mergedAliases, mergeRelationship, now);
      return;
    }

    const session = this.driver.session();
    try {
      const mergeRelationshipType = RelationshipTypeEnum.parse(mergeRelationship.type);
      await session.executeWrite(async (transaction) => {
        await transaction.run(
          `MATCH (canonical {id: $canonical_id, tenant_id: $tenant_id})
           MATCH (duplicate {id: $duplicate_id, tenant_id: $tenant_id})
           SET canonical.aliases = $merged_aliases,
               canonical.updated_at = $now,
               duplicate.status = 'superseded',
               duplicate.updated_at = $now`,
          {
            canonical_id: canonical.id,
            duplicate_id: duplicate.id,
            tenant_id: canonical.tenant_id,
            merged_aliases: mergedAliases,
            now,
          },
        );

        await transaction.run(
          `MATCH (duplicate {id: $duplicate_id, tenant_id: $tenant_id})
                 -[old:HAS_FACT]->(fact:Fact)
           MATCH (canonical {id: $canonical_id, tenant_id: $tenant_id})
           DELETE old
           MERGE (canonical)-[:HAS_FACT]->(fact)
           SET fact.entity_id = $canonical_id,
               fact.last_seen_at = $now`,
          {
            canonical_id: canonical.id,
            duplicate_id: duplicate.id,
            tenant_id: canonical.tenant_id,
            now,
          },
        );

        const relationshipResult = await transaction.run(
          `MATCH (source)-[r]->(target)
           WHERE r.id IS NOT NULL
             AND source.tenant_id = $tenant_id
             AND (source.id = $duplicate_id OR target.id = $duplicate_id)
           RETURN elementId(r) AS element_id, properties(r) AS properties,
                  type(r) AS relationship_type,
                  source.id AS source_node_id, target.id AS target_node_id`,
          {
            duplicate_id: duplicate.id,
            tenant_id: canonical.tenant_id,
          },
        );

        for (const record of relationshipResult.records) {
          const relationshipType = RelationshipTypeEnum.parse(record.get('relationship_type'));
          const sourceNodeId = String(this.toNative(record.get('source_node_id')));
          const targetNodeId = String(this.toNative(record.get('target_node_id')));
          const nextSourceId = sourceNodeId === duplicate.id ? canonical.id : sourceNodeId;
          const nextTargetId = targetNodeId === duplicate.id ? canonical.id : targetNodeId;

          await transaction.run(`MATCH ()-[r]->() WHERE elementId(r) = $element_id DELETE r`, {
            element_id: record.get('element_id'),
          });
          if (nextSourceId === nextTargetId) continue;

          await transaction.run(
            `MATCH (source {id: $source_node_id, tenant_id: $tenant_id})
             MATCH (target {id: $target_node_id, tenant_id: $tenant_id})
             CREATE (source)-[replacement:${relationshipType}]->(target)
             SET replacement = $properties`,
            {
              source_node_id: nextSourceId,
              target_node_id: nextTargetId,
              tenant_id: canonical.tenant_id,
              properties: this.toNative(record.get('properties')),
            },
          );
        }

        await transaction.run(
          `MATCH (source {id: $source_node_id, tenant_id: $tenant_id})
           MATCH (target {id: $target_node_id, tenant_id: $tenant_id})
           CREATE (source)-[r:${mergeRelationshipType}]->(target)
           SET r = $properties`,
          {
            source_node_id: mergeRelationship.source_node_id,
            target_node_id: mergeRelationship.target_node_id,
            tenant_id: mergeRelationship.tenant_id,
            properties: this.relationshipProperties(mergeRelationship),
          },
        );
      });
    } finally {
      await session.close();
    }
  }

  private simulateCypher(queryStr: string, params: Record<string, unknown>): unknown[] {
    const qNormalized = queryStr.replace(/\s+/g, ' ').trim();

    // 1. MATCH (p:Person)-[r:PERSON_OWNS_PROJECT]->(proj:Project) ...
    if (
      qNormalized.includes('PERSON_OWNS_PROJECT') &&
      qNormalized.includes('proj.canonical_name')
    ) {
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

  /**
   * Retrieves facts for a specific entity within a tenant, filtering by status.
   * Pushes the entity and status filter to Cypher when a driver is active,
   * avoiding the O(all-tenant-facts) scan that listFacts performs.
   */
  async listFactsByEntity(
    tenantId: string,
    entityId: string,
    statusFilter?: string,
  ): Promise<Fact[]> {
    if (!this.driver) {
      return Array.from(this.inMemoryFacts.values())
        .filter(
          (f) =>
            f.tenant_id === tenantId &&
            f.entity_id === entityId &&
            (!statusFilter || f.status === statusFilter),
        )
        .map((f) => this.cloneFact(f));
    }

    const session = this.driver.session();
    try {
      const cypher = statusFilter
        ? `MATCH (f:Fact {tenant_id: $tenant_id, entity_id: $entity_id, status: $status})
           OPTIONAL MATCH (f)-[:FACT_SUPPORTED_BY_SOURCE]->(source:Source)
           WHERE source.tenant_id = f.tenant_id
           RETURN f, f.entity_id AS entity_id,
                  coalesce(f.source_id, head(collect(DISTINCT source.id))) AS source_id`
        : `MATCH (f:Fact {tenant_id: $tenant_id, entity_id: $entity_id})
           OPTIONAL MATCH (f)-[:FACT_SUPPORTED_BY_SOURCE]->(source:Source)
           WHERE source.tenant_id = f.tenant_id
           RETURN f, f.entity_id AS entity_id,
                  coalesce(f.source_id, head(collect(DISTINCT source.id))) AS source_id`;
      const result = await session.run(cypher, {
        tenant_id: tenantId,
        entity_id: entityId,
        status: statusFilter ?? null,
      });
      return result.records.map((rec) =>
        this.factFromRecord(rec.get('f'), rec.get('entity_id'), rec.get('source_id')),
      );
    } finally {
      await session.close();
    }
  }

  /**
   * Retrieves facts for a specific entity valid at a given point in time.
   * Bitemporal filtering is pushed to Cypher: valid_from <= time AND
   * (valid_to IS NULL OR valid_to >= time).
   */
  async listFactsByEntityAsOf(
    tenantId: string,
    entityId: string,
    timeIso: string,
  ): Promise<Fact[]> {
    if (!this.driver) {
      const targetTime = new Date(timeIso).getTime();
      return Array.from(this.inMemoryFacts.values())
        .filter((f) => {
          if (f.tenant_id !== tenantId || f.entity_id !== entityId) return false;
          const validFrom = f.valid_from ? new Date(f.valid_from).getTime() : 0;
          const validTo = f.valid_to ? new Date(f.valid_to).getTime() : Infinity;
          return targetTime >= validFrom && targetTime <= validTo;
        })
        .map((f) => this.cloneFact(f));
    }

    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (f:Fact {tenant_id: $tenant_id, entity_id: $entity_id})
         WHERE (f.valid_from IS NULL OR f.valid_from <= $time)
           AND (f.valid_to IS NULL OR f.valid_to >= $time)
         OPTIONAL MATCH (f)-[:FACT_SUPPORTED_BY_SOURCE]->(source:Source)
         WHERE source.tenant_id = f.tenant_id
         RETURN f, f.entity_id AS entity_id,
                coalesce(f.source_id, head(collect(DISTINCT source.id))) AS source_id`,
        { tenant_id: tenantId, entity_id: entityId, time: timeIso },
      );
      return result.records.map((rec) =>
        this.factFromRecord(rec.get('f'), rec.get('entity_id'), rec.get('source_id')),
      );
    } finally {
      await session.close();
    }
  }

  /**
   * Retrieves facts for a specific entity whose recorded_from falls within a date range.
   * Useful for "what changed between these dates" queries.
   */
  async listFactsByEntityChanges(
    tenantId: string,
    entityId: string,
    fromIso: string,
    toIso: string,
  ): Promise<Fact[]> {
    if (!this.driver) {
      const fromTime = new Date(fromIso).getTime();
      const toTime = new Date(toIso).getTime();
      return Array.from(this.inMemoryFacts.values())
        .filter((f) => {
          if (f.tenant_id !== tenantId || f.entity_id !== entityId) return false;
          const recFrom = f.recorded_from ? new Date(f.recorded_from).getTime() : 0;
          return recFrom >= fromTime && recFrom <= toTime;
        })
        .map((f) => this.cloneFact(f));
    }

    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (f:Fact {tenant_id: $tenant_id, entity_id: $entity_id})
         WHERE f.recorded_from IS NOT NULL
           AND f.recorded_from >= $from AND f.recorded_from <= $to
         OPTIONAL MATCH (f)-[:FACT_SUPPORTED_BY_SOURCE]->(source:Source)
         WHERE source.tenant_id = f.tenant_id
         RETURN f, f.entity_id AS entity_id,
                coalesce(f.source_id, head(collect(DISTINCT source.id))) AS source_id`,
        { tenant_id: tenantId, entity_id: entityId, from: fromIso, to: toIso },
      );
      return result.records.map((rec) =>
        this.factFromRecord(rec.get('f'), rec.get('entity_id'), rec.get('source_id')),
      );
    } finally {
      await session.close();
    }
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

  private mergeEntitiesInMemory(
    canonical: GraphNode,
    duplicate: GraphNode,
    mergedAliases: string[],
    mergeRelationship: GraphRelationship,
    now: string,
  ): void {
    this.inMemoryNodes.set(canonical.id, {
      ...canonical,
      aliases: mergedAliases,
      updated_at: now,
    });
    this.inMemoryNodes.set(duplicate.id, {
      ...duplicate,
      status: 'superseded',
      updated_at: now,
    });

    const movedFacts = Array.from(this.inMemoryFacts.values()).filter(
      (fact) => fact.tenant_id === canonical.tenant_id && fact.entity_id === duplicate.id,
    );
    for (const fact of movedFacts) {
      const updatedFact = { ...fact, entity_id: canonical.id, last_seen_at: now };
      this.inMemoryFacts.set(fact.id, updatedFact);
      for (const [relationshipId, relationship] of this.inMemoryRelationships) {
        if (relationshipId.startsWith('rel-fact-') && relationship.target_node_id === fact.id) {
          this.inMemoryRelationships.delete(relationshipId);
        }
      }
      const hasFactRelId = `rel-fact-${canonical.id}-${fact.id}`;
      this.inMemoryRelationships.set(hasFactRelId, {
        id: hasFactRelId,
        tenant_id: fact.tenant_id,
        type: 'PROJECT_HAS_DOCUMENT',
        source_node_id: canonical.id,
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
    }

    for (const [relationshipId, relationship] of [...this.inMemoryRelationships.entries()]) {
      const isSyntheticFactEdge =
        relationshipId.startsWith('rel-fact-') || relationshipId.startsWith('rel-source-');
      if (
        isSyntheticFactEdge ||
        relationship.tenant_id !== canonical.tenant_id ||
        (relationship.source_node_id !== duplicate.id &&
          relationship.target_node_id !== duplicate.id)
      ) {
        continue;
      }

      const sourceNodeId =
        relationship.source_node_id === duplicate.id ? canonical.id : relationship.source_node_id;
      const targetNodeId =
        relationship.target_node_id === duplicate.id ? canonical.id : relationship.target_node_id;
      if (sourceNodeId === targetNodeId) {
        this.inMemoryRelationships.delete(relationshipId);
      } else {
        this.inMemoryRelationships.set(relationshipId, {
          ...relationship,
          source_node_id: sourceNodeId,
          target_node_id: targetNodeId,
        });
      }
    }
    this.inMemoryRelationships.set(mergeRelationship.id, mergeRelationship);
  }

  private nodeFromRecord(rawNode: unknown, rawLabels: unknown): GraphNode {
    const raw = rawNode as { properties: Record<string, unknown> };
    const labels = Array.isArray(rawLabels) ? rawLabels.map(String) : [];
    const type = labels
      .map((label) => NodeTypeEnum.safeParse(label))
      .find((result) => result.success);
    if (!type?.success) {
      throw new Error(`Neo4j node is missing a supported label: ${labels.join(', ')}`);
    }

    const properties = this.toNative(raw.properties) as Record<string, unknown>;
    const knownKeys = new Set([
      'id',
      'tenant_id',
      'canonical_name',
      'aliases',
      'source_system',
      'source_id',
      'confidence',
      'status',
      'created_at',
      'updated_at',
      'valid_from',
      'valid_to',
      'recorded_from',
      'recorded_to',
      'last_seen_at',
      'permissions_hash',
      'source_url',
    ]);
    return {
      id: String(properties.id),
      tenant_id: String(properties.tenant_id),
      type: type.data,
      canonical_name: String(properties.canonical_name ?? ''),
      aliases: Array.isArray(properties.aliases) ? properties.aliases.map(String) : [],
      source_system: String(properties.source_system ?? ''),
      source_id: String(properties.source_id ?? ''),
      confidence: Number(properties.confidence ?? 0),
      status: properties.status as GraphNode['status'],
      created_at: String(properties.created_at ?? ''),
      updated_at: String(properties.updated_at ?? ''),
      valid_from: properties.valid_from ? String(properties.valid_from) : null,
      valid_to: properties.valid_to ? String(properties.valid_to) : null,
      recorded_from: properties.recorded_from ? String(properties.recorded_from) : null,
      recorded_to: properties.recorded_to ? String(properties.recorded_to) : null,
      last_seen_at: String(properties.last_seen_at ?? ''),
      permissions_hash: properties.permissions_hash ? String(properties.permissions_hash) : null,
      source_url: properties.source_url ? String(properties.source_url) : null,
      properties: Object.fromEntries(
        Object.entries(properties).filter(([key]) => !knownKeys.has(key)),
      ),
    };
  }

  private factFromRecord(rawFact: unknown, rawEntityId: unknown, rawSourceId: unknown): Fact {
    const raw = rawFact as { properties: Record<string, unknown> };
    const properties = this.toNative(raw.properties) as Record<string, unknown>;
    const rawValue = properties.value;
    let value = rawValue;
    if (typeof rawValue === 'string' && /^[{[]/.test(rawValue)) {
      try {
        value = JSON.parse(rawValue);
      } catch {
        value = rawValue;
      }
    }

    return {
      id: String(properties.id),
      tenant_id: String(properties.tenant_id),
      entity_id: String(this.toNative(rawEntityId) ?? properties.entity_id ?? ''),
      predicate: String(properties.predicate ?? ''),
      value,
      confidence: Number(properties.confidence ?? 0),
      status: properties.status as Fact['status'],
      valid_from: properties.valid_from ? String(properties.valid_from) : null,
      valid_to: properties.valid_to ? String(properties.valid_to) : null,
      recorded_from: properties.recorded_from ? String(properties.recorded_from) : null,
      recorded_to: properties.recorded_to ? String(properties.recorded_to) : null,
      source_id: String(this.toNative(rawSourceId) ?? properties.source_id ?? ''),
      evidence_spans: Array.isArray(properties.evidence_spans)
        ? properties.evidence_spans.map(String)
        : [],
      last_seen_at: String(properties.last_seen_at ?? ''),
    };
  }

  private relationshipFromRecord(
    rawRelationship: unknown,
    rawRelationshipType: unknown,
    rawSourceNodeId: unknown,
    rawTargetNodeId: unknown,
    rawTenantId: unknown,
  ): GraphRelationship {
    const raw = rawRelationship as { properties: Record<string, unknown> };
    const properties = this.toNative(raw.properties) as Record<string, unknown>;
    const knownKeys = new Set([
      'id',
      'tenant_id',
      'confidence',
      'evidence_source_ids',
      'extraction_method',
      'valid_from',
      'valid_to',
      'recorded_from',
      'recorded_to',
      'status',
      'correction_state',
    ]);
    return {
      id: String(properties.id),
      tenant_id: String(properties.tenant_id ?? this.toNative(rawTenantId)),
      type: RelationshipTypeEnum.parse(rawRelationshipType),
      source_node_id: String(this.toNative(rawSourceNodeId)),
      target_node_id: String(this.toNative(rawTargetNodeId)),
      confidence: Number(properties.confidence ?? 0),
      evidence_source_ids: Array.isArray(properties.evidence_source_ids)
        ? properties.evidence_source_ids.map(String)
        : [],
      extraction_method: String(properties.extraction_method ?? ''),
      valid_from: properties.valid_from ? String(properties.valid_from) : null,
      valid_to: properties.valid_to ? String(properties.valid_to) : null,
      recorded_from: properties.recorded_from ? String(properties.recorded_from) : null,
      recorded_to: properties.recorded_to ? String(properties.recorded_to) : null,
      status: properties.status as GraphRelationship['status'],
      correction_state: properties.correction_state as GraphRelationship['correction_state'],
      properties: Object.fromEntries(
        Object.entries(properties).filter(([key]) => !knownKeys.has(key)),
      ),
    };
  }

  private cloneNode(node: GraphNode): GraphNode {
    return { ...node, aliases: [...node.aliases], properties: { ...node.properties } };
  }

  private cloneFact(fact: Fact): Fact {
    return {
      ...fact,
      evidence_spans: [...fact.evidence_spans],
      value:
        fact.value && typeof fact.value === 'object' ? structuredClone(fact.value) : fact.value,
    };
  }

  private cloneRelationship(relationship: GraphRelationship): GraphRelationship {
    return {
      ...relationship,
      evidence_source_ids: [...relationship.evidence_source_ids],
      properties: { ...relationship.properties },
    };
  }

  private isSyntheticFactEdge(relationshipId: string): boolean {
    return relationshipId.startsWith('rel-fact-') || relationshipId.startsWith('rel-source-');
  }

  private relationshipProperties(rel: GraphRelationship): Record<string, unknown> {
    return {
      id: rel.id,
      tenant_id: rel.tenant_id,
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
    };
  }

  private toNative(value: unknown): unknown {
    if (neo4j.isInt(value)) return value.toNumber();
    if (Array.isArray(value)) return value.map((item) => this.toNative(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, this.toNative(item)]),
      );
    }
    return value;
  }
}
export const neo4jClient = new Neo4jClient();
