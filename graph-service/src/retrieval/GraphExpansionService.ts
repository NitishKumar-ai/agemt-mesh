import { GraphNode } from '../domain/entities.js';
import { GraphRelationship } from '../domain/relationships.js';
import { neo4jClient, Neo4jClient } from '../infra/neo4j.client.js';
import { VectorSearchHit } from '@agentmesh/common';

export interface ExpandedContext {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}

export class GraphExpansionService {
  constructor(private readonly n4j: Neo4jClient = neo4jClient) {}

  async expand(tenantId: string, hits: VectorSearchHit[], depth = 2): Promise<ExpandedContext> {
    const startIds = new Set<string>();
    for (const hit of hits) {
      const doc = hit.document;
      if (doc.resourceType === 'Fact') {
        if (doc.metadata?.entityId) {
          startIds.add(doc.metadata.entityId as string);
        }
        startIds.add(doc.resourceId);
      } else {
        startIds.add(doc.resourceId);
      }
    }

    if (startIds.size === 0) {
      return { nodes: [], relationships: [] };
    }

    // If live Neo4j driver is present, use Cypher
    if ((this.n4j as any).driver) {
      try {
        const query = `
          MATCH (start)
          WHERE start.id IN $ids AND start.tenant_id = $tenant_id
          MATCH path = (start)-[*1..${depth}]-(neighbor)
          WHERE neighbor.tenant_id = $tenant_id
          RETURN nodes(path) as path_nodes, relationships(path) as path_rels
        `;
        const result = await this.n4j.runCypher(query, {
          ids: Array.from(startIds),
          tenant_id: tenantId,
        });

        const nodeMap = new Map<string, GraphNode>();
        const relMap = new Map<string, GraphRelationship>();

        for (const row of result) {
          const pathNodes = (row as any).path_nodes || [];
          const pathRels = (row as any).path_rels || [];

          for (const node of pathNodes) {
            if (node && node.tenant_id === tenantId) {
              nodeMap.set(node.id, node);
            }
          }
          for (const rel of pathRels) {
            if (rel && rel.tenant_id === tenantId) {
              relMap.set(rel.id, rel);
            }
          }
        }

        return {
          nodes: Array.from(nodeMap.values()),
          relationships: Array.from(relMap.values()),
        };
      } catch (err) {
        console.error('[GraphExpansion] Neo4j Cypher expand failed, falling back to BFS:', err);
      }
    }

    // In-memory BFS fallback
    const allNodes = await this.n4j.listNodes(tenantId);
    const allRels = await this.n4j.listRelationships(tenantId);
    
    const allFacts = await this.n4j.listFacts(tenantId);
    const factNodes: GraphNode[] = allFacts.map((fact) => ({
      id: fact.id,
      tenant_id: fact.tenant_id,
      type: 'Incident',
      canonical_name: `${fact.predicate}: ${fact.value}`,
      aliases: [],
      source_system: 'system',
      source_id: fact.source_id,
      confidence: fact.confidence,
      status: fact.status,
      permissions_hash: null,
    } as any));

    const nodesById = new Map<string, GraphNode>();
    for (const node of [...allNodes, ...factNodes]) {
      nodesById.set(node.id, node);
    }

    const adjacency = new Map<string, Array<{ rel: GraphRelationship; target: string }>>();
    
    const inMemoryRels = Array.from((this.n4j as any).inMemoryRelationships?.values() || []) as GraphRelationship[];
    const combinedRels = [...allRels, ...inMemoryRels];
    const relsById = new Map<string, GraphRelationship>();

    for (const rel of combinedRels) {
      if (rel.tenant_id !== tenantId) continue;
      relsById.set(rel.id, rel);

      if (!adjacency.has(rel.source_node_id)) adjacency.set(rel.source_node_id, []);
      if (!adjacency.has(rel.target_node_id)) adjacency.set(rel.target_node_id, []);

      adjacency.get(rel.source_node_id)!.push({ rel, target: rel.target_node_id });
      adjacency.get(rel.target_node_id)!.push({ rel, target: rel.source_node_id });
    }

    const visitedNodes = new Set<string>();
    const visitedRels = new Set<string>();

    const queue: Array<[string, number]> = Array.from(startIds).map((id) => [id, 0]);
    for (const id of startIds) {
      visitedNodes.add(id);
    }

    while (queue.length > 0) {
      const [currId, currDepth] = queue.shift()!;
      
      if (currDepth >= depth) continue;

      const neighbors = adjacency.get(currId) || [];
      for (const { rel, target } of neighbors) {
        if (!visitedNodes.has(target)) {
          visitedNodes.add(target);
          queue.push([target, currDepth + 1]);
        }
        visitedRels.add(rel.id);
      }
    }

    const resultNodes: GraphNode[] = [];
    for (const id of visitedNodes) {
      const node = nodesById.get(id);
      if (node) resultNodes.push(node);
    }

    const resultRels: GraphRelationship[] = [];
    for (const id of visitedRels) {
      const rel = relsById.get(id);
      if (rel) resultRels.push(rel);
    }

    return {
      nodes: resultNodes,
      relationships: resultRels,
    };
  }
}
