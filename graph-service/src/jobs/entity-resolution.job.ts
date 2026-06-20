import { Neo4jClient } from '../infra/neo4j.client.js';
import { GraphNode } from '../domain/entities.js';
import { GraphRelationship } from '../domain/relationships.js';
import crypto from 'node:crypto';

/**
 * Confidence at/above this auto-merges two nodes outright (alias + fact +
 * relationship reassignment, duplicate marked superseded). Below it, nodes
 * are only linked via ENTITY_ALIAS_OF for a human to confirm via the
 * existing manual correction path (GraphService.applyCorrection). Auto-merge
 * is intentionally conservative: wrongly merging two real entities silently
 * corrupts the fact graph in a way that's hard to notice and hard to undo.
 */
const AUTO_MERGE_THRESHOLD = 0.95;
/** Below this, two nodes are considered unrelated and no link is created at all — avoids flooding the graph with low-signal alias hints. */
const REVIEW_THRESHOLD = 0.5;

export interface ResolutionPair {
  nodeA: string;
  nodeB: string;
  confidence: number;
  matchType: 'exact_name' | 'alias_overlap' | 'token_overlap';
}

export interface EntityResolutionReport {
  resolvedCount: number;
  autoMergedCount: number;
  pendingReviewCount: number;
  pairs: ResolutionPair[];
}

function normalize(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ');
}

function tokenize(name: string): Set<string> {
  return new Set(normalize(name).split(' ').filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function canonicalFirst(nodeA: GraphNode, nodeB: GraphNode): [GraphNode, GraphNode] {
  const createdA = Date.parse(nodeA.created_at);
  const createdB = Date.parse(nodeB.created_at);
  if (Number.isFinite(createdA) && Number.isFinite(createdB) && createdA !== createdB) {
    return createdA < createdB ? [nodeA, nodeB] : [nodeB, nodeA];
  }
  return nodeA.id.localeCompare(nodeB.id) <= 0 ? [nodeA, nodeB] : [nodeB, nodeA];
}

function linkedPairKey(idA: string, idB: string): string {
  return idA.localeCompare(idB) <= 0 ? `${idA}\u0000${idB}` : `${idB}\u0000${idA}`;
}

/**
 * Scores how likely two nodes of the same type, possibly from different
 * source_systems (e.g. a Slack profile and a Gdrive author), refer to the
 * same real-world entity. Cross-source matching is the point: dedup across
 * connectors is the gap this job exists to close, so source_system is
 * deliberately not part of the match criteria.
 */
function scoreMatch(
  nodeA: GraphNode,
  nodeB: GraphNode,
): { confidence: number; matchType: ResolutionPair['matchType'] } | null {
  const normA = normalize(nodeA.canonical_name);
  const normB = normalize(nodeB.canonical_name);

  if (normA && normA === normB) {
    return { confidence: 0.97, matchType: 'exact_name' };
  }

  const aliasesA = new Set([...nodeA.aliases, nodeA.canonical_name].map(normalize));
  const aliasesB = new Set([...nodeB.aliases, nodeB.canonical_name].map(normalize));
  const sharedAlias = [...aliasesA].some((alias) => alias && aliasesB.has(alias));
  if (sharedAlias) {
    return { confidence: 0.95, matchType: 'alias_overlap' };
  }

  const similarity = jaccard(tokenize(nodeA.canonical_name), tokenize(nodeB.canonical_name));
  if (similarity >= 0.8) {
    return { confidence: 0.85, matchType: 'token_overlap' };
  }
  if (similarity >= REVIEW_THRESHOLD) {
    return { confidence: 0.6 + similarity * 0.2, matchType: 'token_overlap' };
  }

  return null;
}

export class EntityResolutionJob {
  constructor(private readonly neo4jClient: Neo4jClient) {}

  /**
   * Scans all nodes in a tenant for probable duplicates across sources.
   * High-confidence matches are auto-merged; everything else is left as an
   * ENTITY_ALIAS_OF hint for a human reviewer.
   */
  async resolveEntities(tenantId: string): Promise<EntityResolutionReport> {
    const nodes = (await this.neo4jClient.listNodes(tenantId)).filter(
      (node) => node.status === 'current' && node.type !== 'Fact' && node.type !== 'Source',
    );

    const report: EntityResolutionReport = {
      resolvedCount: 0,
      autoMergedCount: 0,
      pendingReviewCount: 0,
      pairs: [],
    };

    const alreadyMerged = new Set<string>();
    const linkedPairs = new Set(
      (await this.neo4jClient.listRelationships(tenantId))
        .filter((relationship) =>
          ['ENTITY_ALIAS_OF', 'ENTITY_MERGED_INTO'].includes(relationship.type),
        )
        .map((relationship) =>
          linkedPairKey(relationship.source_node_id, relationship.target_node_id),
        ),
    );

    for (let i = 0; i < nodes.length; i++) {
      const nodeA = nodes[i];
      if (!nodeA || alreadyMerged.has(nodeA.id)) continue;

      for (let j = i + 1; j < nodes.length; j++) {
        const nodeB = nodes[j];
        if (!nodeB || alreadyMerged.has(nodeB.id)) continue;
        if (nodeA.type !== nodeB.type) continue;

        const match = scoreMatch(nodeA, nodeB);
        if (!match) continue;

        if (linkedPairs.has(linkedPairKey(nodeA.id, nodeB.id))) continue;

        report.pairs.push({
          nodeA: nodeA.id,
          nodeB: nodeB.id,
          confidence: match.confidence,
          matchType: match.matchType,
        });
        report.resolvedCount++;

        if (match.confidence >= AUTO_MERGE_THRESHOLD) {
          const merge = await this.autoMerge(nodeA, nodeB, tenantId, match.confidence);
          alreadyMerged.add(merge.duplicateId);
          this.rewireLinkedPairs(linkedPairs, merge.canonicalId, merge.duplicateId);
          linkedPairs.add(linkedPairKey(merge.canonicalId, merge.duplicateId));
          report.autoMergedCount++;
          if (merge.duplicateId === nodeA.id) break;
        } else {
          await this.linkForReview(nodeA, nodeB, tenantId, match.confidence);
          linkedPairs.add(linkedPairKey(nodeA.id, nodeB.id));
          report.pendingReviewCount++;
        }
      }
    }

    return report;
  }

  private rewireLinkedPairs(
    linkedPairs: Set<string>,
    canonicalId: string,
    duplicateId: string,
  ): void {
    for (const key of Array.from(linkedPairs)) {
      const [idA, idB] = key.split('\u0000');
      if (!idA || !idB || (idA !== duplicateId && idB !== duplicateId)) continue;

      linkedPairs.delete(key);
      const otherId = idA === duplicateId ? idB : idA;
      if (otherId !== canonicalId) {
        linkedPairs.add(linkedPairKey(canonicalId, otherId));
      }
    }
  }

  private async linkForReview(
    nodeA: GraphNode,
    nodeB: GraphNode,
    tenantId: string,
    confidence: number,
  ): Promise<void> {
    const now = new Date().toISOString();
    const rel: GraphRelationship = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      type: 'ENTITY_ALIAS_OF',
      source_node_id: nodeA.id,
      target_node_id: nodeB.id,
      confidence,
      evidence_source_ids: [],
      extraction_method: 'entity_resolution_job',
      valid_from: now,
      valid_to: null,
      recorded_from: now,
      recorded_to: null,
      status: 'current',
      correction_state: 'uncorrected',
      properties: {},
    };
    await this.neo4jClient.upsertRelationship(rel);
  }

  /**
   * Merges nodeB into nodeA (the earlier-created node wins as canonical):
   * consolidates aliases, reassigns nodeB's facts and relationships onto
   * nodeA, marks nodeB superseded, and records an ENTITY_MERGED_INTO link
   * so the merge is auditable/reversible by a human later.
   */
  private async autoMerge(
    nodeA: GraphNode,
    nodeB: GraphNode,
    tenantId: string,
    confidence: number,
  ): Promise<{ canonicalId: string; duplicateId: string }> {
    const [canonical, duplicate] = canonicalFirst(nodeA, nodeB);
    const now = new Date().toISOString();

    const mergedAliases = Array.from(
      new Set([...canonical.aliases, duplicate.canonical_name, ...duplicate.aliases]),
    ).filter((alias) => alias !== canonical.canonical_name);

    const mergeRelationship: GraphRelationship = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      type: 'ENTITY_MERGED_INTO',
      source_node_id: duplicate.id,
      target_node_id: canonical.id,
      confidence,
      evidence_source_ids: [],
      extraction_method: 'entity_resolution_job',
      valid_from: now,
      valid_to: null,
      recorded_from: now,
      recorded_to: null,
      status: 'current',
      correction_state: 'uncorrected',
      properties: {},
    };
    await this.neo4jClient.mergeEntities(
      canonical,
      duplicate,
      mergedAliases,
      mergeRelationship,
      now,
    );
    canonical.aliases = mergedAliases;
    canonical.updated_at = now;
    duplicate.status = 'superseded';
    duplicate.updated_at = now;
    return { canonicalId: canonical.id, duplicateId: duplicate.id };
  }
}
