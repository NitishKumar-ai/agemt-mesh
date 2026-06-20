import { VectorSearchService, SearchTextOptions } from '../search/VectorSearchService.js';
import { GraphExpansionService, ExpandedContext } from './GraphExpansionService.js';
import { RerankingService } from './RerankingService.js';
import { ConfidenceCalibration } from './ConfidenceCalibration.js';
import { PolicyEngine, policyEngine } from '../auth/PolicyEngine.js';

export interface RetrievalResult {
  hits: Array<any & { calibratedScore: number; rerankScore: number; blendedScore: number }>;
  expandedContext: ExpandedContext;
}

export class RetrievalOrchestrator {
  constructor(
    private readonly vectorSearch: VectorSearchService,
    private readonly graphExpansion: GraphExpansionService,
    private readonly reranking: RerankingService,
    private readonly policy: PolicyEngine = policyEngine,
  ) {}

  async retrieve(
    tenantId: string,
    userId: string | undefined,
    query: string,
    limit = 10,
    options: SearchTextOptions = {},
  ): Promise<RetrievalResult> {
    // 1. Fetch semantic vector search hits
    const vectorHits = await this.vectorSearch.search(tenantId, query, {
      ...options,
      limit,
    });

    // 2. Fetch keyword lookup matches (Hybrid Search)
    const keywordHits = await this.performKeywordSearch(tenantId, query, limit);

    // Merge and deduplicate hits by document id
    const mergedHitsMap = new Map<string, any>();
    for (const hit of [...vectorHits, ...keywordHits]) {
      mergedHitsMap.set(hit.document.id, hit);
    }
    const combinedHits = Array.from(mergedHitsMap.values());

    // 3. Filter by principal permissions
    const access = this.policy.resolveAccess(tenantId, userId);
    const visibleHits = combinedHits.filter((hit) =>
      this.policy.isVisible(hit.document.permissionHash, access),
    );

    // 4. Score & rerank visible hits using LLM-Based relevance scores
    const rerankedHits = await this.reranking.rerank(query, visibleHits);

    // 5. Calibrate confidence scores
    const calibratedHits = rerankedHits.map((hit) => {
      const calibratedScore = ConfidenceCalibration.calibrate(hit.blendedScore);
      return {
        ...hit,
        calibratedScore,
      };
    });

    // 6. Expand local subgraphs (up to depth 2)
    const expandedContext = await this.graphExpansion.expand(tenantId, calibratedHits as any, 2);

    // Filter expanded nodes by permission
    const filteredNodes = expandedContext.nodes.filter((node) =>
      this.policy.isVisible(node.permissions_hash, access),
    );

    // Filter relationships: source and target must exist in filteredNodes
    const visibleNodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredRelationships = expandedContext.relationships.filter(
      (rel) => visibleNodeIds.has(rel.source_node_id) && visibleNodeIds.has(rel.target_node_id),
    );

    return {
      hits: calibratedHits.slice(0, limit),
      expandedContext: {
        nodes: filteredNodes,
        relationships: filteredRelationships,
      },
    };
  }

  private async performKeywordSearch(
    tenantId: string,
    query: string,
    limit: number,
  ): Promise<any[]> {
    const term = query.toLowerCase().trim();
    if (!term) return [];

    try {
      // Access n4j client via GraphExpansionService
      const n4j = (this.graphExpansion as any).n4j;
      const nodes = await n4j.listNodes(tenantId);
      const facts = await n4j.listFacts(tenantId);

      const hits: any[] = [];

      for (const node of nodes) {
        const content = [
          node.canonical_name,
          ...(node.aliases || []),
          JSON.stringify(node.properties || {}),
        ].join(' ').toLowerCase();

        if (content.includes(term)) {
          hits.push({
            document: {
              id: `node:${node.id}`,
              tenantId: node.tenant_id,
              resourceId: node.id,
              resourceType: node.type,
              content: [node.canonical_name, ...(node.aliases || [])].join(' '),
              permissionHash: node.permissions_hash ?? null,
            },
            score: 0.8,
          });
        }
      }

      for (const fact of facts) {
        const content = [
          fact.predicate,
          typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value || {}),
          ...(fact.evidence_spans || []),
        ].join(' ').toLowerCase();

        if (content.includes(term)) {
          hits.push({
            document: {
              id: `fact:${fact.id}`,
              tenantId: fact.tenant_id,
              resourceId: fact.id,
              resourceType: 'Fact',
              content: [
                fact.predicate,
                typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value || {}),
              ].join(' '),
              permissionHash: null, // Default public
            },
            score: 0.7,
          });
        }
      }

      return hits.slice(0, limit);
    } catch (err) {
      console.warn('[RetrievalOrchestrator] Keyword fallback search failed:', err);
      return [];
    }
  }
}
