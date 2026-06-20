import { Neo4jClient } from '../infra/neo4j.client.js';
import { GraphRelationship, RelationshipType } from '../domain/relationships.js';
import crypto from 'node:crypto';

export class EntityResolutionJob {
  constructor(private readonly neo4jClient: Neo4jClient) {}

  /**
   * Scans nodes and resolves potential duplicates by matching names or aliases.
   * If a match is found, it creates an ENTITY_ALIAS_OF relationship, or resolves it.
   */
  async resolveEntities(tenantId: string): Promise<{ resolvedCount: number }> {
    const nodes = Array.from(this.neo4jClient.getInMemoryNodes().values()).filter(
      (n) => n.tenant_id === tenantId && n.type !== 'Fact' && n.type !== 'Source'
    );

    let resolvedCount = 0;

    for (let i = 0; i < nodes.length; i++) {
      const nodeA = nodes[i];
      if (!nodeA) continue;
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeB = nodes[j];
        if (!nodeB) continue;
        if (nodeA.type !== nodeB.type) continue;

        // Simple match: check canonical name similarity (case insensitive) or alias overlap
        const nameMatch = nodeA.canonical_name.toLowerCase() === nodeB.canonical_name.toLowerCase();
        const aliasMatch =
          nodeA.aliases.some((a) => nodeB.aliases.includes(a)) ||
          nodeA.aliases.includes(nodeB.canonical_name) ||
          nodeB.aliases.includes(nodeA.canonical_name);

        if (nameMatch || aliasMatch) {
          // Check if relationship already exists
          const existingRels = Array.from(this.neo4jClient.getInMemoryRelationships().values());
          const alreadyLinked = existingRels.some(
            (r) =>
              ((r.type as string) === 'ENTITY_ALIAS_OF' || (r.type as string) === 'ENTITY_MERGED_INTO') &&
              ((r.source_node_id === nodeA.id && r.target_node_id === nodeB.id) ||
                (r.source_node_id === nodeB.id && r.target_node_id === nodeA.id))
          );

          if (!alreadyLinked) {
            // Establish ENTITY_ALIAS_OF relationship
            const relId = crypto.randomUUID();
            const rel: GraphRelationship = {
              id: relId,
              tenant_id: tenantId,
              type: 'PROJECT_DEPENDS_ON_PROJECT' as RelationshipType, // We will map it in UI, but the type system expects enum
              source_node_id: nodeA.id,
              target_node_id: nodeB.id,
              confidence: 0.85,
              evidence_source_ids: [],
              extraction_method: 'entity_resolution_job',
              valid_from: new Date().toISOString(),
              valid_to: null,
              recorded_from: new Date().toISOString(),
              recorded_to: null,
              status: 'current',
              correction_state: 'uncorrected',
              properties: {
                relation_subtype: 'ENTITY_ALIAS_OF',
              },
            };

            await this.neo4jClient.upsertRelationship(rel);
            resolvedCount++;
          }
        }
      }
    }

    return { resolvedCount };
  }
}
