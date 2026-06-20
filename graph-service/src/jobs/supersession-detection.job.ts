import { Neo4jClient } from '../infra/neo4j.client.js';
import { Fact } from '../domain/facts.js';
import { GraphRelationship } from '../domain/relationships.js';
import crypto from 'node:crypto';

export class SupersessionDetectionJob {
  constructor(private readonly neo4jClient: Neo4jClient) {}

  /**
   * Evaluates a new fact against existing facts for the same entity and predicate.
   * If the new fact has a newer valid_from date or higher authority weight and different value,
   * it marks the previous current facts as superseded and creates FACT_SUPERSEDES_FACT.
   * If there is an unresolved conflict, it marks both as contradicted.
   */
  async detectSupersession(
    newFact: Fact,
    sourceAuthorityMap: Record<string, number> = {},
  ): Promise<void> {
    const tenantId = newFact.tenant_id;
    const entityId = newFact.entity_id;
    const predicate = newFact.predicate;

    const tenantFacts = await this.neo4jClient.listFacts(tenantId);
    const existingFacts = tenantFacts.filter(
      (f) =>
        f.tenant_id === tenantId &&
        f.entity_id === entityId &&
        f.predicate === predicate &&
        f.id !== newFact.id &&
        f.status === 'current',
    );

    const newValidFrom = newFact.valid_from ? new Date(newFact.valid_from).getTime() : Date.now();
    const pendingRelationships: GraphRelationship[] = [];

    for (const oldFact of existingFacts) {
      const oldValidFrom = oldFact.valid_from ? new Date(oldFact.valid_from).getTime() : 0;
      const oldVal =
        typeof oldFact.value === 'object' ? JSON.stringify(oldFact.value) : String(oldFact.value);
      const newVal =
        typeof newFact.value === 'object' ? JSON.stringify(newFact.value) : String(newFact.value);

      if (oldVal === newVal) {
        // Same value: just update recorded/valid boundaries or last_seen
        continue;
      }

      const oldAuth = sourceAuthorityMap[oldFact.source_id] ?? 0.5;
      const newAuth = sourceAuthorityMap[newFact.source_id] ?? 0.5;

      // Rule: Newer valid time OR higher authority wins
      const isNewer = newValidFrom > oldValidFrom;
      const hasHigherAuthority = newAuth > oldAuth;
      const isOverlapping = newValidFrom === oldValidFrom;

      if (isNewer || (hasHigherAuthority && !isNewer && !isOverlapping)) {
        // Supersede!
        oldFact.status = 'superseded';
        oldFact.valid_to = newFact.valid_from;
        oldFact.recorded_to = newFact.recorded_from;
        await this.neo4jClient.upsertFact(oldFact);

        // Create FACT_SUPERSEDES_FACT relationship
        const relId = crypto.randomUUID();
        const rel: GraphRelationship = {
          id: relId,
          tenant_id: tenantId,
          type: 'FACT_SUPERSEDES_FACT',
          source_node_id: newFact.id,
          target_node_id: oldFact.id,
          confidence: 0.9,
          evidence_source_ids: [newFact.source_id, oldFact.source_id],
          extraction_method: 'supersession_detection_job',
          valid_from: newFact.valid_from,
          valid_to: null,
          recorded_from: newFact.recorded_from,
          recorded_to: null,
          status: 'current',
          correction_state: 'uncorrected',
          properties: {},
        };
        pendingRelationships.push(rel);
      } else if (isOverlapping && Math.abs(newAuth - oldAuth) < 0.05) {
        // Both are active, recent, and have similar authority: contradiction!
        oldFact.status = 'contradicted';
        newFact.status = 'contradicted';
        await this.neo4jClient.upsertFact(oldFact);

        // Create FACT_CONTRADICTS_FACT relationship
        const relId = crypto.randomUUID();
        const rel: GraphRelationship = {
          id: relId,
          tenant_id: tenantId,
          type: 'FACT_CONTRADICTS_FACT',
          source_node_id: newFact.id,
          target_node_id: oldFact.id,
          confidence: 0.95,
          evidence_source_ids: [newFact.source_id, oldFact.source_id],
          extraction_method: 'supersession_detection_job',
          valid_from: newFact.valid_from,
          valid_to: null,
          recorded_from: newFact.recorded_from,
          recorded_to: null,
          status: 'current',
          correction_state: 'uncorrected',
          properties: {},
        };
        pendingRelationships.push(rel);
      } else {
        // New fact is older or has lower authority: it is marked as superseded from inception
        newFact.status = 'superseded';
        newFact.valid_to = oldFact.valid_from;
        newFact.recorded_to = oldFact.recorded_from;
      }
    }

    // Persist the incoming fact before creating fact-to-fact edges because
    // Neo4j relationship upserts require both endpoint nodes to already exist.
    await this.neo4jClient.upsertFact(newFact);
    for (const relationship of pendingRelationships) {
      await this.neo4jClient.upsertRelationship(relationship);
    }
  }
}
