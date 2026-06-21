import { neo4jClient } from '../infra/neo4j.client.js';
import { postgresClient, CorrectionRecord } from '../infra/postgres.client.js';
import { EntityResolutionJob, EntityResolutionReport } from '../jobs/entity-resolution.job.js';
import { RelationUpsertJob } from '../jobs/relation-upsert.job.js';
import { SupersessionDetectionJob } from '../jobs/supersession-detection.job.js';
import { GraphNode } from '../domain/entities.js';
import { GraphRelationship } from '../domain/relationships.js';
import { Fact } from '../domain/facts.js';
import crypto from 'node:crypto';
import {
  ReindexReport,
  SearchTextOptions,
  VectorSearchService,
} from '../search/VectorSearchService.js';
import { EmbeddingProvider, VectorSearchHit, VectorSearchStore } from '@agentmesh/common';
import {
  createEmbeddingProviderFromEnv,
  createVectorSearchStoreFromEnv,
} from '../search/search.config.js';
import {
  RetrievalEvaluationCase,
  RetrievalEvaluationReport,
  RetrievalEvaluationService,
} from '../search/RetrievalEvaluationService.js';
import { telemetryMetricsRegistry } from './TelemetryMetricsRegistry.js';

const UNKNOWN_SOURCE_PERMISSION = '__unknown_source_permission__';
const SUPPORTED_CORRECTION_TYPES = new Set([
  'FACT_INVALIDATE',
  'FACT_UPDATE',
  'ENTITY_MERGE',
  'ENTITY_SPLIT',
]);

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
  private readonly entityResolutionJob: EntityResolutionJob;
  private readonly relationUpsertJob: RelationUpsertJob;
  private readonly supersessionDetectionJob: SupersessionDetectionJob;
  private readonly sourcePermissionHashes = new Map<string, string | null>();

  constructor(
    private readonly n4j = neo4jClient,
    private readonly pg = postgresClient,
    embeddingProvider: EmbeddingProvider = createEmbeddingProviderFromEnv(),
    vectorStore: VectorSearchStore = createVectorSearchStoreFromEnv(embeddingProvider),
  ) {
    this.entityResolutionJob = new EntityResolutionJob(this.n4j);
    this.relationUpsertJob = new RelationUpsertJob(this.n4j);
    this.supersessionDetectionJob = new SupersessionDetectionJob(this.n4j);
    this.vectorSearch = new VectorSearchService(embeddingProvider, vectorStore);
    this.retrievalEvaluation = new RetrievalEvaluationService(this.vectorSearch);
  }

  private readonly vectorSearch: VectorSearchService;
  private readonly retrievalEvaluation: RetrievalEvaluationService;

  // -- Node & Edge Ingestion --

  async ingestNode(node: GraphNode): Promise<void> {
    const now = new Date().toISOString();
    node.aliases = node.aliases ?? [];
    node.properties = node.properties ?? {};
    node.permissions_hash = node.permissions_hash ?? null;
    node.source_url = node.source_url ?? null;
    node.created_at = node.created_at || now;
    node.updated_at = now;
    node.last_seen_at = now;
    node.status = node.status || 'current';
    await this.n4j.upsertNode(node);
    this.sourcePermissionHashes.set(
      this.sourcePermissionKey(node.tenant_id, node.id),
      node.permissions_hash,
    );
    this.sourcePermissionHashes.set(
      this.sourcePermissionKey(node.tenant_id, node.source_id),
      node.permissions_hash,
    );
    await this.syncNodeIndex(node);
    const supportedFacts = (await this.n4j.listFacts(node.tenant_id)).filter(
      (fact) => fact.source_id === node.id || fact.source_id === node.source_id,
    );
    await Promise.all(supportedFacts.map((fact) => this.syncFactIndex(fact)));
  }

  async ingestRelationship(rel: GraphRelationship): Promise<void> {
    await this.relationUpsertJob.upsertRelationship(rel);
  }

  /**
   * Looks up the permissions_hash recorded for a node/source id at ingest
   * time. Returns `undefined` if the source was never registered via
   * ingestNode; callers must fail closed in that case. Returns `null` only
   * when the source was explicitly registered as public.
   */
  getSourcePermissionHash(tenantId: string, sourceId: string): string | null | undefined {
    return this.sourcePermissionHashes.get(this.sourcePermissionKey(tenantId, sourceId));
  }

  /**
   * Resolves an ACL from persisted graph data when the process-local cache is
   * cold, such as after a service restart. Both node ids and connector source
   * ids are supported, and every datastore lookup is tenant scoped.
   */
  async resolveSourcePermissionHash(
    tenantId: string,
    sourceId: string,
  ): Promise<string | null | undefined> {
    const cacheKey = this.sourcePermissionKey(tenantId, sourceId);
    if (this.sourcePermissionHashes.has(cacheKey)) {
      return this.sourcePermissionHashes.get(cacheKey);
    }

    let sourceNode = await this.n4j.getNode(sourceId, tenantId);
    if (!sourceNode) {
      const tenantNodes = await this.n4j.listNodes(tenantId);
      sourceNode = tenantNodes.find((node) => node.id === sourceId || node.source_id === sourceId);
    }
    if (!sourceNode) return undefined;

    this.cacheSourcePermissionNode(sourceNode);
    return sourceNode.permissions_hash;
  }

  async ingestFact(fact: Fact, sourceAuthorityMap: Record<string, number> = {}): Promise<void> {
    const now = new Date().toISOString();
    fact.last_seen_at = now;
    fact.status = fact.status || 'current';
    await this.supersessionDetectionJob.detectSupersession(fact, sourceAuthorityMap);
    const entityFacts = await this.getFactsHistory(fact.entity_id, fact.tenant_id);
    await Promise.all(entityFacts.map((storedFact) => this.syncFactIndex(storedFact)));
  }

  async search(
    tenantId: string,
    query: string,
    options: SearchTextOptions = {},
  ): Promise<VectorSearchHit[]> {
    const startedAt = Date.now();
    const hits = await this.vectorSearch.search(tenantId, query, options);
    telemetryMetricsRegistry.recordSearchLatency(Date.now() - startedAt);
    return hits;
  }

  async clearSearchIndex(): Promise<void> {
    await this.vectorSearch.clear();
    this.sourcePermissionHashes.clear();
  }

  async closeSearchIndex(): Promise<void> {
    await this.vectorSearch.close();
  }

  async getSearchInfo(tenantId?: string): Promise<{
    provider: string;
    model: string;
    dimensions: number;
    indexedDocuments: number;
  }> {
    return this.vectorSearch.getInfo(tenantId);
  }

  async reindexSearch(tenantId: string, batchSize = 64): Promise<ReindexReport> {
    const nodes = await this.n4j.listNodes(tenantId);
    const facts = await this.n4j.listFacts(tenantId);
    const prefix = `${tenantId}\u0000`;
    for (const key of this.sourcePermissionHashes.keys()) {
      if (key.startsWith(prefix)) this.sourcePermissionHashes.delete(key);
    }
    for (const node of nodes) {
      this.sourcePermissionHashes.set(
        this.sourcePermissionKey(node.tenant_id, node.id),
        node.permissions_hash,
      );
      this.sourcePermissionHashes.set(
        this.sourcePermissionKey(node.tenant_id, node.source_id),
        node.permissions_hash,
      );
    }

    const documents = [
      ...nodes
        .filter((node) => node.status === 'current')
        .map((node) => this.nodeToSearchDocument(node)),
      ...facts
        .filter((fact) => fact.status === 'current')
        .map((fact) => this.factToSearchDocument(fact)),
    ];
    return this.vectorSearch.reindex(tenantId, documents, batchSize);
  }

  async evaluateSearch(
    cases: RetrievalEvaluationCase[],
    k = 10,
  ): Promise<RetrievalEvaluationReport> {
    const report = await this.retrievalEvaluation.evaluate(cases, k);
    const metrics = { mrr: report.meanReciprocalRank };
    telemetryMetricsRegistry.recordRetrieval(
      k === 5
        ? { ...metrics, recall_at_5: report.recallAtK }
        : k === 10
          ? { ...metrics, recall_at_10: report.recallAtK }
          : metrics,
    );
    return report;
  }

  async runCypher(queryStr: string, params?: Record<string, unknown>): Promise<unknown[]> {
    return await this.n4j.runCypher(queryStr, params);
  }

  async getProjectContext(projectId: string, tenantId: string): Promise<unknown> {
    const result = await this.n4j.runCypher(
      `
      MATCH (proj:Project {id: $project_id, tenant_id: $tenant_id})
      OPTIONAL MATCH (proj)-[:PROJECT_HAS_DOCUMENT]->(doc:Document {tenant_id: $tenant_id})
      OPTIONAL MATCH (proj)<-[:PERSON_OWNS_PROJECT]-(owner:Person {tenant_id: $tenant_id})
      OPTIONAL MATCH (proj)-[:PROJECT_HAS_TASK]->(task:Task {tenant_id: $tenant_id})
      OPTIONAL MATCH (proj)<-[:DECISION_AFFECTS_PROJECT]-(decision:Decision {tenant_id: $tenant_id})
      RETURN proj, collect(doc), collect(owner), collect(task), collect(decision)
      `,
      { project_id: projectId, tenant_id: tenantId },
    );
    return result[0] || null;
  }

  /**
   * All current source/entity nodes for a tenant. Used by the knowledge UI to
   * list provenance documents. Permission filtering is applied by the caller
   * using each node's permissions_hash, so this returns the full tenant set.
   */
  async listNodesForTenant(tenantId: string): Promise<GraphNode[]> {
    return (await this.n4j.listNodes(tenantId)).filter((node) => node.status === 'current');
  }

  /**
   * All current facts for a tenant, with source permission hashes hydrated so
   * the caller can filter by the viewing principal's access grant.
   */
  async listFactsForTenant(tenantId: string): Promise<Fact[]> {
    const facts = (await this.n4j.listFacts(tenantId)).filter((fact) => fact.status === 'current');
    await this.hydrateFactSourcePermissions(tenantId, facts);
    return facts;
  }

  async findCurrentEntityIds(
    tenantId: string,
    entityType: GraphNode['type'],
    lookup: string,
  ): Promise<string[]> {
    const normalizedLookup = lookup.trim().toLowerCase();
    if (!normalizedLookup) return [];

    return (await this.n4j.listNodes(tenantId))
      .filter(
        (node) =>
          node.tenant_id === tenantId &&
          node.type === entityType &&
          node.status === 'current' &&
          (node.id === lookup ||
            node.canonical_name.toLowerCase() === normalizedLookup ||
            node.aliases.some((alias) => alias.toLowerCase() === normalizedLookup)),
      )
      .map((node) => node.id);
  }

  // -- Temporal Fact Lookups --

  async getFactsCurrent(entityId: string, tenantId: string): Promise<Fact[]> {
    // A blank scope means "search everything this caller may see" rather than a
    // literal entity whose id is the empty string (which matches nothing). Pull
    // every current fact in the tenant; the caller still applies ACL filtering
    // downstream, so this never widens what an individual principal can read.
    const currentFacts =
      entityId && entityId.trim()
        ? await this.n4j.listFactsByEntity(tenantId, entityId, 'current')
        : (await this.n4j.listFacts(tenantId)).filter((fact) => fact.status === 'current');
    await this.hydrateFactSourcePermissions(tenantId, currentFacts);
    return currentFacts;
  }

  async getFactsHistory(entityId: string, tenantId: string): Promise<Fact[]> {
    const historicalFacts = await this.n4j.listFactsByEntity(tenantId, entityId);
    await this.hydrateFactSourcePermissions(tenantId, historicalFacts);
    return historicalFacts;
  }

  async getFactsAsOf(entityId: string, tenantId: string, timeStr: string): Promise<Fact[]> {
    const factsAsOf = await this.n4j.listFactsByEntityAsOf(tenantId, entityId, timeStr);
    await this.hydrateFactSourcePermissions(tenantId, factsAsOf);
    return factsAsOf;
  }

  async getFactsChanges(
    entityId: string,
    tenantId: string,
    fromStr: string,
    toStr: string,
  ): Promise<Fact[]> {
    const changedFacts = await this.n4j.listFactsByEntityChanges(
      tenantId,
      entityId,
      fromStr,
      toStr,
    );
    await this.hydrateFactSourcePermissions(tenantId, changedFacts);
    return changedFacts;
  }

  async getFactsConflicts(entityId: string, tenantId: string): Promise<Fact[]> {
    // Contradiction-driven abstention is a per-scope signal: it only makes sense
    // when the caller named a specific entity. A blank scope is a broad search,
    // so we do not surface unrelated contradictions from elsewhere in the tenant
    // (otherwise a single contradicted entity would make every scopeless ask
    // abstain). Returning no conflicts lets the broad current-fact answer stand.
    if (!entityId || !entityId.trim()) return [];
    const conflictingFacts = await this.n4j.listFactsByEntity(tenantId, entityId, 'contradicted');
    await this.hydrateFactSourcePermissions(tenantId, conflictingFacts);
    return conflictingFacts;
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
  }): Promise<{
    correction_id: string;
    status: string;
    affected_objects: { facts: string[]; entities: string[]; relationships: string[] };
  }> {
    this.assertSupportedCorrectionType(correction.correction_type);
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

    const affectedFacts: string[] = [];
    const affectedEntities: string[] = [];
    const affectedRelationships: string[] = [];

    // Processing based on Correction Type
    const type = correction.correction_type;

    if (type === 'FACT_INVALIDATE') {
      this.assertCorrectionTargetType(correction.target_type, 'fact', type);
      const fact = await this.requireFact(correction.target_id, correction.tenant_id);
      record.old_value = JSON.stringify(fact.value);

      const invalidatedFact: Fact = {
        ...fact,
        status: 'invalidated',
        valid_to: now,
        recorded_to: now,
      };
      await this.n4j.upsertFact(invalidatedFact);
      await this.syncFactIndex(invalidatedFact);
      affectedFacts.push(invalidatedFact.id);
      affectedEntities.push(invalidatedFact.entity_id);
    } else if (type === 'FACT_UPDATE') {
      this.assertCorrectionTargetType(correction.target_type, 'fact', type);
      const oldFact = await this.requireFact(correction.target_id, correction.tenant_id);
      record.old_value = JSON.stringify(oldFact.value);

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
        source_id: correction.supporting_source_ids?.[0] || oldFact.source_id,
        evidence_spans: [correction.reason || 'Human corrected'],
        last_seen_at: now,
      };

      const supersededFact: Fact = {
        ...oldFact,
        status: 'superseded',
        valid_to: now,
        recorded_to: now,
      };
      await this.n4j.upsertFact(supersededFact);
      await this.n4j.upsertFact(newFact);
      await Promise.all([this.syncFactIndex(supersededFact), this.syncFactIndex(newFact)]);

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
    } else if (type === 'ENTITY_MERGE') {
      this.assertCorrectionTargetType(correction.target_type, 'entity', type);
      const sourceId = correction.target_id;
      const targetId = correction.new_value?.canonical_entity_id;
      if (!targetId) {
        throw new Error('ENTITY_MERGE requires new_value.canonical_entity_id');
      }

      const sourceNode = await this.requireNode(sourceId, correction.tenant_id);
      const targetNode = await this.requireNode(targetId, correction.tenant_id);
      if (sourceNode.id === targetNode.id) {
        throw new Error('ENTITY_MERGE source and canonical entity must be different');
      }

      const mergedAliases = Array.from(
        new Set([...targetNode.aliases, sourceNode.canonical_name, ...sourceNode.aliases]),
      );
      const updatedTargetNode: GraphNode = {
        ...targetNode,
        aliases: mergedAliases,
        status: 'current',
        updated_at: now,
      };
      const updatedSourceNode: GraphNode = {
        ...sourceNode,
        status: 'superseded',
        updated_at: now,
      };
      const sourceFacts = (await this.n4j.listFacts(correction.tenant_id)).filter(
        (fact) => fact.entity_id === sourceNode.id,
      );

      const rel: GraphRelationship = {
        id: crypto.randomUUID(),
        tenant_id: correction.tenant_id,
        type: 'ENTITY_MERGED_INTO',
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
        properties: {},
      };

      // The datastore owns fact/edge movement so Neo4j and the fallback follow the same path.
      await this.n4j.mergeEntities(updatedTargetNode, updatedSourceNode, mergedAliases, rel, now);
      await Promise.all([
        this.n4j.upsertNode(updatedTargetNode),
        this.n4j.upsertNode(updatedSourceNode),
      ]);
      await Promise.all([
        this.syncNodeIndex(updatedTargetNode),
        this.syncNodeIndex(updatedSourceNode),
      ]);

      // mergeEntities atomically moves HAS_FACT and persists entity_id.
      // Refresh the search metadata with the canonical identity.
      for (const fact of sourceFacts) {
        await this.syncFactIndex({
          ...fact,
          entity_id: targetNode.id,
          last_seen_at: now,
        });
      }

      affectedEntities.push(sourceNode.id, targetNode.id);
    } else if (type === 'ENTITY_SPLIT') {
      this.assertCorrectionTargetType(correction.target_type, 'entity', type);
      const originalId = correction.target_id;
      const originalNode = await this.requireNode(originalId, correction.tenant_id);
      const targets = correction.new_value?.targets || [];
      if (targets.length === 0) {
        throw new Error('ENTITY_SPLIT requires at least one target');
      }

      const seenFactIds = new Set<string>();
      const seenRelationshipIds = new Set<string>();
      const plans: Array<{
        node: GraphNode;
        facts: Fact[];
        relationships: GraphRelationship[];
      }> = [];

      // Validate the complete reassignment plan before making any datastore changes.
      for (const targetConfig of targets) {
        if (!targetConfig.canonical_name.trim()) {
          throw new Error('ENTITY_SPLIT target canonical_name must not be empty');
        }

        const facts: Fact[] = [];
        for (const factId of targetConfig.facts_to_reassign || []) {
          if (seenFactIds.has(factId)) {
            throw new Error(`Fact ${factId} is assigned to more than one split target`);
          }
          seenFactIds.add(factId);
          const fact = await this.requireFact(factId, correction.tenant_id);
          if (fact.entity_id !== originalId) {
            throw new Error(`Fact ${factId} is not assigned to entity ${originalId}`);
          }
          facts.push(fact);
        }

        const relationships: GraphRelationship[] = [];
        for (const relId of targetConfig.relationships_to_reassign || []) {
          if (seenRelationshipIds.has(relId)) {
            throw new Error(`Relationship ${relId} is assigned to more than one split target`);
          }
          seenRelationshipIds.add(relId);
          const relationship = await this.requireRelationship(relId, correction.tenant_id);
          if (
            relationship.source_node_id !== originalId &&
            relationship.target_node_id !== originalId
          ) {
            throw new Error(`Relationship ${relId} is not attached to entity ${originalId}`);
          }
          relationships.push(relationship);
        }

        plans.push({
          node: {
            id: crypto.randomUUID(),
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
          },
          facts,
          relationships,
        });
      }

      for (const plan of plans) {
        await this.n4j.upsertNode(plan.node);
        await this.syncNodeIndex(plan.node);
        affectedEntities.push(plan.node.id);

        for (const fact of plan.facts) {
          const reassignedFact = await this.n4j.reassignFact(
            fact.id,
            correction.tenant_id,
            plan.node.id,
            now,
          );
          if (!reassignedFact) {
            throw new Error(`Failed to reassign fact ${fact.id} to entity ${plan.node.id}`);
          }
          await this.syncFactIndex(reassignedFact);
          affectedFacts.push(fact.id);
        }

        for (const relationship of plan.relationships) {
          const reassignedRelationship = await this.n4j.reassignRelationship(
            relationship.id,
            correction.tenant_id,
            originalId,
            plan.node.id,
          );
          if (!reassignedRelationship) {
            throw new Error(
              `Failed to reassign relationship ${relationship.id} to entity ${plan.node.id}`,
            );
          }
          affectedRelationships.push(relationship.id);
        }
      }

      const supersededOriginal: GraphNode = {
        ...originalNode,
        status: 'superseded',
        updated_at: now,
      };
      await this.n4j.upsertNode(supersededOriginal);
      await this.syncNodeIndex(supersededOriginal);
      affectedEntities.unshift(originalId);
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

  async resolveOutstandingEntities(tenantId: string): Promise<EntityResolutionReport> {
    const report = await this.entityResolutionJob.resolveEntities(tenantId);
    if (report.autoMergedCount > 0) {
      await this.reindexSearch(tenantId);
    }
    return report;
  }

  async storeSourceACLs(tenantId: string, connectorId: string, aclData: any): Promise<void> {
    const node = await this.n4j.getNode(connectorId, tenantId);
    if (!node) {
      console.warn(`Source node ${connectorId} not found for tenant ${tenantId}. Cannot store ACLs.`);
      return;
    }
    
    // Hash the ACL data to generate a permissions hash
    const permissionsHash = crypto.createHash('sha256').update(JSON.stringify(aclData)).digest('hex');
    
    node.permissions_hash = permissionsHash;
    node.updated_at = new Date().toISOString();
    await this.n4j.upsertNode(node);
    this.cacheSourcePermissionNode(node);
    await this.syncNodeIndex(node);
  }

  async updatePermissionHashes(tenantId: string, aclData: any): Promise<void> {
    // Reindex vector search documents that may have changed permissions
    // The sourcePermissionHashes map is already updated in storeSourceACLs
    const facts = await this.n4j.listFacts(tenantId);
    const affectedFacts = facts.filter(f => 
      this.sourcePermissionHashes.has(this.sourcePermissionKey(tenantId, f.source_id))
    );
    await Promise.all(affectedFacts.map(fact => this.syncFactIndex(fact)));
  }

  private async syncFactIndex(fact: Fact): Promise<void> {
    const indexId = `fact:${fact.id}`;
    if (fact.status !== 'current') {
      await this.vectorSearch.delete(fact.tenant_id, indexId);
      return;
    }

    await this.vectorSearch.index(this.factToSearchDocument(fact));
  }

  private async syncNodeIndex(node: GraphNode): Promise<void> {
    const indexId = `node:${node.id}`;
    if (node.status !== 'current') {
      await this.vectorSearch.delete(node.tenant_id, indexId);
      return;
    }
    await this.vectorSearch.index(this.nodeToSearchDocument(node));
  }

  private nodeToSearchDocument(node: GraphNode) {
    return {
      id: `node:${node.id}`,
      tenantId: node.tenant_id,
      resourceId: node.id,
      resourceType: node.type,
      content: [node.canonical_name, ...node.aliases, JSON.stringify(node.properties)].join(' '),
      permissionHash: node.permissions_hash,
      metadata: {
        sourceSystem: node.source_system,
        sourceId: node.source_id,
        status: node.status,
        confidence: node.confidence,
      },
    };
  }

  private factToSearchDocument(fact: Fact) {
    return {
      id: `fact:${fact.id}`,
      tenantId: fact.tenant_id,
      resourceId: fact.id,
      resourceType: 'Fact',
      content: [
        fact.predicate,
        typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value),
        ...fact.evidence_spans,
      ].join(' '),
      permissionHash: this.sourcePermissionHashes.has(
        this.sourcePermissionKey(fact.tenant_id, fact.source_id),
      )
        ? (this.sourcePermissionHashes.get(
            this.sourcePermissionKey(fact.tenant_id, fact.source_id),
          ) ?? null)
        : UNKNOWN_SOURCE_PERMISSION,
      metadata: {
        entityId: fact.entity_id,
        predicate: fact.predicate,
        value: fact.value,
        sourceId: fact.source_id,
        confidence: fact.confidence,
        status: fact.status,
      },
    };
  }

  private sourcePermissionKey(tenantId: string, sourceId: string): string {
    return `${tenantId}\u0000${sourceId}`;
  }

  private cacheSourcePermissionNode(node: GraphNode): void {
    this.sourcePermissionHashes.set(
      this.sourcePermissionKey(node.tenant_id, node.id),
      node.permissions_hash,
    );
    this.sourcePermissionHashes.set(
      this.sourcePermissionKey(node.tenant_id, node.source_id),
      node.permissions_hash,
    );
  }

  private async hydrateFactSourcePermissions(tenantId: string, facts: Fact[]): Promise<void> {
    const unresolvedSourceIds = new Set(
      facts
        .map((fact) => fact.source_id)
        .filter(
          (sourceId) =>
            !this.sourcePermissionHashes.has(this.sourcePermissionKey(tenantId, sourceId)),
        ),
    );
    if (unresolvedSourceIds.size === 0) return;

    // Load the tenant's nodes once so a multi-source fact read does not issue
    // one full graph scan per source id.
    const tenantNodes = await this.n4j.listNodes(tenantId);
    for (const node of tenantNodes) {
      if (unresolvedSourceIds.has(node.id) || unresolvedSourceIds.has(node.source_id)) {
        this.cacheSourcePermissionNode(node);
      }
    }
  }

  private assertCorrectionTargetType(
    actual: string,
    expected: 'fact' | 'entity',
    correctionType: string,
  ): void {
    if (actual !== expected) {
      throw new Error(`${correctionType} requires target_type "${expected}"`);
    }
  }

  private assertSupportedCorrectionType(correctionType: string): void {
    if (!SUPPORTED_CORRECTION_TYPES.has(correctionType)) {
      throw new Error(`Unsupported correction type: ${correctionType}`);
    }
  }

  private async requireFact(id: string, tenantId: string): Promise<Fact> {
    const fact = await this.n4j.getFact(id, tenantId);
    if (!fact) {
      throw new Error(`Fact ${id} was not found for tenant ${tenantId}`);
    }
    return fact;
  }

  private async requireNode(id: string, tenantId: string): Promise<GraphNode> {
    const node = await this.n4j.getNode(id, tenantId);
    if (!node) {
      throw new Error(`Entity ${id} was not found for tenant ${tenantId}`);
    }
    return node;
  }

  private async requireRelationship(id: string, tenantId: string): Promise<GraphRelationship> {
    const relationship = await this.n4j.getRelationship(id, tenantId);
    if (!relationship) {
      throw new Error(`Relationship ${id} was not found for tenant ${tenantId}`);
    }
    return relationship;
  }
}

export const graphService = new GraphService();
