import { Neo4jClient } from '../infra/neo4j.client.js';
import { GraphRelationship } from '../domain/relationships.js';

export class RelationUpsertJob {
  constructor(private readonly neo4jClient: Neo4jClient) {}

  /**
   * Upserts a relationship. If an older relationship of the same type exists
   * between the same source and target nodes, it supersedes it.
   */
  async upsertRelationship(rel: GraphRelationship): Promise<void> {
    const existingRels = await this.neo4jClient.listRelationships(rel.tenant_id);

    const now = new Date().toISOString();
    const validFrom = rel.valid_from || now;
    const recordedFrom = rel.recorded_from || now;

    // Set defaults on the incoming relationship if needed
    rel.valid_from = validFrom;
    rel.recorded_from = recordedFrom;

    for (const oldRel of existingRels) {
      if (
        oldRel.tenant_id === rel.tenant_id &&
        oldRel.type === rel.type &&
        oldRel.source_node_id === rel.source_node_id &&
        oldRel.target_node_id === rel.target_node_id &&
        oldRel.id !== rel.id &&
        oldRel.status === 'current'
      ) {
        // Supersede the old relationship
        oldRel.valid_to = validFrom;
        oldRel.recorded_to = recordedFrom;
        oldRel.status = 'superseded';
        await this.neo4jClient.upsertRelationship(oldRel);
      }
    }

    await this.neo4jClient.upsertRelationship(rel);
  }
}
