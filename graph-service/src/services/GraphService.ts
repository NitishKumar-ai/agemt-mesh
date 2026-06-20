import { neo4jClient } from '../infra/neo4j.client.js';
import { postgresClient, CorrectionRecord } from '../infra/postgres.client.js';
import { EntityResolutionJob } from '../jobs/entity-resolution.job.js';
import { RelationUpsertJob } from '../jobs/relation-upsert.job.js';
import { SupersessionDetectionJob } from '../jobs/supersession-detection.job.js';
import { GraphNode } from '../domain/entities.js';
import { GraphRelationship, RelationshipType } from '../domain/relationships.js';
import { Fact } from '../domain/facts.js';
import crypto from 'node:crypto';

export interface CorrectionValue {
  predicate?: string;
  value?: unknown;
  canonical_entity_id?: string;
  targets?: Array<{
    canonical_name: string;
    aliases?: string[];
    facts_to_reassign?: string[];
    relationships_to_reassign?: string[];
  }>;
}

export class GraphService {
  private entityResolutionJob = new EntityResolutionJob(neo4jClient);
  private relationUpsertJob = new RelationUpsertJob(neo4jClient);
  private supersessionDetectionJob = new SupersessionDetectionJob(neo4jClient);

  constructor(
    private readonly n4j = neo4jClient,
    private readonly pg = postgresClient
  ) {}

  // -- Node & Edge Ingestion --

  async ingestNode(node: GraphNode): Promise<void> {
    const now = new Date().toISOString();
    node.created_at = node.created_at || now;
    node.updated_at = now;
    node.last_seen_at = now;
    node.status = node.status || 'current';
    await this.n4j.upsertNode(node);
  }

  async ingestRelationship(rel: GraphRelationship): Promise<void> {
    await this.relationUpsertJob.upsertRelationship(rel);
  }

  async ingestFact(fact: Fact, sourceAuthorityMap: Record<string, number> = {}): Promise<void> {
    const now = new Date().toISOString();
    fact.last_seen_at = now;
    fact.status = fact.status || 'current';
    await this.supersessionDetectionJob.detectSupersession(fact, sourceAuthorityMap);
  }

  async runCypher(queryStr: string, params?: Record<string, unknown>): Promise<unknown[]> {
    return await this.n4j.runCypher(queryStr, params);
  }

  async getProjectContext(projectId: string): Promise<unknown> {
    const result = await this.n4j.runCypher(
      `
      MATCH (proj:Project {id: $project_id})
      OPTIONAL MATCH (proj)-[:PROJECT_HAS_DOCUMENT]->(doc:Document)
      OPTIONAL MATCH (proj)<-[:PERSON_OWNS_PROJECT]-(owner:Person)
      OPTIONAL MATCH (proj)-[:PROJECT_HAS_TASK]->(task:Task)
      OPTIONAL MATCH (proj)<-[:DECISION_AFFECTS_PROJECT]-(decision:Decision)
      RETURN proj, collect(doc), collect(owner), collect(task), collect(decision)
      `,
      { project_id: projectId }
    );
    return result[0] || null;
  }

  // -- Temporal Fact Lookups --

  async getFactsCurrent(entityId: string, tenantId: string): Promise<Fact[]> {
    const facts = Array.from(this.n4j.getInMemoryFacts().values());
    return facts.filter(
      (f) => f.tenant_id === tenantId && f.entity_id === entityId && f.status === 'current'
    );
  }

  async getFactsHistory(entityId: string, tenantId: string): Promise<Fact[]> {
    const facts = Array.from(this.n4j.getInMemoryFacts().values());
    return facts.filter((f) => f.tenant_id === tenantId && f.entity_id === entityId);
  }

  async getFactsAsOf(entityId: string, tenantId: string, timeStr: string): Promise<Fact[]> {
    const facts = Array.from(this.n4j.getInMemoryFacts().values());
    const targetTime = new Date(timeStr).getTime();

    return facts.filter((f) => {
      if (f.tenant_id !== tenantId || f.entity_id !== entityId) return false;

      const validFrom = f.valid_from ? new Date(f.valid_from).getTime() : 0;
      const validTo = f.valid_to ? new Date(f.valid_to).getTime() : Infinity;

      return targetTime >= validFrom && targetTime <= validTo;
    });
  }

  async getFactsChanges(entityId: string, tenantId: string, fromStr: string, toStr: string): Promise<Fact[]> {
    const facts = Array.from(this.n4j.getInMemoryFacts().values());
    const fromTime = new Date(fromStr).getTime();
    const toTime = new Date(toStr).getTime();

    return facts.filter((f) => {
      if (f.tenant_id !== tenantId || f.entity_id !== entityId) return false;
      const recFrom = f.recorded_from ? new Date(f.recorded_from).getTime() : 0;
      return recFrom >= fromTime && recFrom <= toTime;
    });
  }

  async getFactsConflicts(entityId: string, tenantId: string): Promise<Fact[]> {
    const facts = Array.from(this.n4j.getInMemoryFacts().values());
    return facts.filter(
      (f) => f.tenant_id === tenantId && f.entity_id === entityId && f.status === 'contradicted'
    );
  }

  // -- Human Correction loop --

  async applyCorrection(correction: {
    tenant_id: string;
    user_id: string;
    answer_id?: string;
    correction_type: string;
    target_type: string;
    target_id: string;
    reason?: string;
    new_value?: CorrectionValue;
    supporting_source_ids?: string[];
  }): Promise<{ correction_id: string; status: string; affected_objects: { facts: string[]; entities: string[]; relationships: string[] } }> {
    const correctionId = crypto.randomUUID();
    const now = new Date().toISOString();

    const record: CorrectionRecord = {
      id: correctionId,
      tenant_id: correction.tenant_id,
      user_id: correction.user_id,
      correction_type: correction.correction_type,
      target_type: correction.target_type,
      target_id: correction.target_id,
      reason: correction.reason || null,
      new_value: JSON.stringify(correction.new_value || {}),
      old_value: null,
      status: 'queued',
      requires_review: 0,
      created_at: now,
      applied_at: null,
      rejected_at: null,
    };

    // Find old value for audit trail if target is Fact
    if (correction.target_type === 'fact') {
      const fact = this.n4j.getInMemoryFacts().get(correction.target_id);
      if (fact) {
        record.old_value = JSON.stringify(fact.value);
      }
    }

    const affectedFacts: string[] = [];
    const affectedEntities: string[] = [];
    const affectedRelationships: string[] = [];

    // Processing based on Correction Type
    const type = correction.correction_type;

    if (type === 'FACT_INVALIDATE' && correction.target_type === 'fact') {
      const fact = this.n4j.getInMemoryFacts().get(correction.target_id);
      if (fact) {
        fact.status = 'invalidated';
        fact.valid_to = now;
        fact.recorded_to = now;
        await this.n4j.upsertFact(fact);
        affectedFacts.push(fact.id);
        affectedEntities.push(fact.entity_id);
      }
    } else if (type === 'FACT_UPDATE' && correction.target_type === 'fact') {
      const oldFact = this.n4j.getInMemoryFacts().get(correction.target_id);
      if (oldFact) {
        // Create new fact
        const newFactId = crypto.randomUUID();
        const newFact: Fact = {
          id: newFactId,
          tenant_id: correction.tenant_id,
          entity_id: oldFact.entity_id,
          predicate: correction.new_value?.predicate || oldFact.predicate,
          value: correction.new_value?.value,
          confidence: 1.0, // Human correction gets absolute confidence
          status: 'current',
          valid_from: now,
          valid_to: null,
          recorded_from: now,
          recorded_to: null,
          source_id: correction.supporting_source_ids?.[0] || 'human_correction',
          evidence_spans: [correction.reason || 'Human corrected'],
          last_seen_at: now,
        };

        // Supersede old fact
        oldFact.status = 'superseded';
        oldFact.valid_to = now;
        oldFact.recorded_to = now;
        await this.n4j.upsertFact(oldFact);
        await this.n4j.upsertFact(newFact);

        // Create relationship link
        const relId = crypto.randomUUID();
        const rel: GraphRelationship = {
          id: relId,
          tenant_id: correction.tenant_id,
          type: 'FACT_SUPERSEDES_FACT',
          source_node_id: newFactId,
          target_node_id: oldFact.id,
          confidence: 1.0,
          evidence_source_ids: [],
          extraction_method: 'human_correction',
          valid_from: now,
          valid_to: null,
          recorded_from: now,
          recorded_to: null,
          status: 'current',
          correction_state: 'corrected',
          properties: {},
        };
        await this.n4j.upsertRelationship(rel);

        affectedFacts.push(oldFact.id, newFactId);
        affectedEntities.push(oldFact.entity_id);
      }
    } else if (type === 'ENTITY_MERGE') {
      // Merge source entities into target entity
      const sourceId = correction.target_id;
      const targetId = correction.new_value?.canonical_entity_id;

      const sourceNode = this.n4j.getInMemoryNodes().get(sourceId);
      const targetNode = targetId ? this.n4j.getInMemoryNodes().get(targetId) : undefined;

      if (sourceNode && targetNode) {
        // Update aliases of targetNode
        if (!targetNode.aliases.includes(sourceNode.canonical_name)) {
          targetNode.aliases.push(sourceNode.canonical_name);
        }
        sourceNode.aliases.forEach((a) => {
          if (!targetNode.aliases.includes(a)) {
            targetNode.aliases.push(a);
          }
        });
        targetNode.status = 'current';
        await this.n4j.upsertNode(targetNode);

        // Invalidate/supersede sourceNode
        sourceNode.status = 'superseded';
        await this.n4j.upsertNode(sourceNode);

        // Add ENTITY_MERGED_INTO relationship
        const relId = crypto.randomUUID();
        const rel: GraphRelationship = {
          id: relId,
          tenant_id: correction.tenant_id,
          type: 'PROJECT_DEPENDS_ON_PROJECT' as RelationshipType, // We will map it in UI, but the type system expects enum
          source_node_id: sourceNode.id,
          target_node_id: targetNode.id,
          confidence: 1.0,
          evidence_source_ids: [],
          extraction_method: 'human_correction',
          valid_from: now,
          valid_to: null,
          recorded_from: now,
          recorded_to: null,
          status: 'current',
          correction_state: 'corrected',
          properties: {
            relation_subtype: 'ENTITY_MERGED_INTO',
          },
        };
        await this.n4j.upsertRelationship(rel);

        affectedEntities.push(sourceNode.id, targetNode.id);
      }
    } else if (type === 'ENTITY_SPLIT') {
      // Split node into target nodes
      const originalId = correction.target_id;
      const originalNode = this.n4j.getInMemoryNodes().get(originalId);
      const targets = correction.new_value?.targets || []; // array of { canonical_name, aliases, facts_to_reassign: [], relationships_to_reassign: [] }

      if (originalNode && targets.length > 0) {
        originalNode.status = 'superseded';
        await this.n4j.upsertNode(originalNode);
        affectedEntities.push(originalId);

        for (const targetConfig of targets) {
          const newId = crypto.randomUUID();
          const newNode: GraphNode = {
            id: newId,
            tenant_id: correction.tenant_id,
            type: originalNode.type,
            canonical_name: targetConfig.canonical_name,
            aliases: targetConfig.aliases || [],
            source_system: 'correction_split',
            source_id: originalNode.source_id,
            confidence: 1.0,
            status: 'current',
            created_at: now,
            updated_at: now,
            valid_from: now,
            valid_to: null,
            recorded_from: now,
            recorded_to: null,
            last_seen_at: now,
            permissions_hash: originalNode.permissions_hash,
            source_url: originalNode.source_url,
            properties: {},
          };
          await this.n4j.upsertNode(newNode);
          affectedEntities.push(newId);

          // Reassign facts
          const factsToReassign = targetConfig.facts_to_reassign || [];
          for (const factId of factsToReassign) {
            const fact = this.n4j.getInMemoryFacts().get(factId);
            if (fact) {
              fact.entity_id = newId;
              await this.n4j.upsertFact(fact);
              affectedFacts.push(factId);
            }
          }

          // Reassign relationships
          const relsToReassign = targetConfig.relationships_to_reassign || [];
          for (const relId of relsToReassign) {
            const rel = this.n4j.getInMemoryRelationships().get(relId);
            if (rel) {
              if (rel.source_node_id === originalId) rel.source_node_id = newId;
              if (rel.target_node_id === originalId) rel.target_node_id = newId;
              await this.n4j.upsertRelationship(rel);
              affectedRelationships.push(relId);
            }
          }
        }
      }
    }

    record.status = 'applied';
    record.applied_at = now;
    await this.pg.insertCorrection(record);

    return {
      correction_id: correctionId,
      status: 'applied',
      affected_objects: {
        facts: affectedFacts,
        entities: affectedEntities,
        relationships: affectedRelationships,
      },
    };
  }

  async getAuditLog(tenantId: string): Promise<CorrectionRecord[]> {
    return await this.pg.listCorrections(tenantId);
  }

  async resolveOutstandingEntities(tenantId: string): Promise<{ resolvedCount: number }> {
    return await this.entityResolutionJob.resolveEntities(tenantId);
  }
}

export const graphService = new GraphService();
