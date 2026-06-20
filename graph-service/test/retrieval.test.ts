import { describe, it, expect, beforeEach } from 'vitest';
import { neo4jClient } from '../src/infra/neo4j.client.js';
import { GraphNode } from '../src/domain/entities.js';
import { GraphRelationship } from '../src/domain/relationships.js';
import { Fact } from '../src/domain/facts.js';
import { GraphExpansionService } from '../src/retrieval/GraphExpansionService.js';
import { ConfidenceCalibration } from '../src/retrieval/ConfidenceCalibration.js';
import { RerankingService } from '../src/retrieval/RerankingService.js';
import { RetrievalOrchestrator } from '../src/retrieval/RetrievalOrchestrator.js';
import { VectorSearchService } from '../src/search/VectorSearchService.js';
import { InMemoryVectorSearchStore } from '../src/search/InMemoryVectorSearchStore.js';
import { DeterministicEmbeddingProvider } from '../src/search/DeterministicEmbeddingProvider.js';

describe('Retrieval Suite', () => {
  const tenantId = 'tenant_retrieval_test';

  beforeEach(async () => {
    await neo4jClient.clear();
  });

  describe('ConfidenceCalibration', () => {
    it('should calibrate scores correctly to [0, 1] range', () => {
      expect(ConfidenceCalibration.calibrate(0.0)).toBeLessThanOrEqual(0.01);
      expect(ConfidenceCalibration.calibrate(0.5)).toBe(0.5);
      expect(ConfidenceCalibration.calibrate(1.0)).toBeGreaterThanOrEqual(0.99);
    });
  });

  describe('RerankingService', () => {
    it('should fall back to word overlap when llms are not configured', async () => {
      const rerankSvc = new RerankingService();
      const score = await rerankSvc.scoreRelevance('find orange fruit', 'Apple is a red fruit, but orange is orange');
      expect(score).toBeGreaterThan(0.0);
      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('should rerank hits based on blended scores', async () => {
      const rerankSvc = new RerankingService();
      const hits = [
        {
          document: {
            id: '1',
            tenantId,
            resourceId: '1',
            resourceType: 'Document',
            content: 'Apple juice recipe',
            permissionHash: null,
          },
          score: 0.9,
        },
        {
          document: {
            id: '2',
            tenantId,
            resourceId: '2',
            resourceType: 'Document',
            content: 'Vulnerable NPM package found in source',
            permissionHash: null,
          },
          score: 0.1,
        },
      ];

      const query = 'NPM security vulnerabilities';
      const reranked = await rerankSvc.rerank(query, hits, 0.05); // low alpha to let word overlap dominate

      // Hit 2 should be ranked first because it overlaps more with query terms
      expect(reranked[0].document.id).toBe('2');
      expect(reranked[0].blendedScore).toBeGreaterThan(reranked[1].blendedScore);
    });
  });

  describe('GraphExpansionService (BFS Fallback)', () => {
    it('should expand graph contexts up to depth 2 in-memory', async () => {
      // Ingest nodes
      const n1: GraphNode = {
        id: 'node-a',
        tenant_id: tenantId,
        type: 'Person',
        canonical_name: 'Alice',
        aliases: [],
        source_system: 'test',
        source_id: 'alice-src',
        confidence: 1.0,
        status: 'current',
      };
      const n2: GraphNode = {
        id: 'node-b',
        tenant_id: tenantId,
        type: 'Project',
        canonical_name: 'Project Mesh',
        aliases: [],
        source_system: 'test',
        source_id: 'mesh-src',
        confidence: 1.0,
        status: 'current',
      };
      const n3: GraphNode = {
        id: 'node-c',
        tenant_id: tenantId,
        type: 'Organization',
        canonical_name: 'DeepMind',
        aliases: [],
        source_system: 'test',
        source_id: 'dm-src',
        confidence: 1.0,
        status: 'current',
      };

      await neo4jClient.upsertNode(n1);
      await neo4jClient.upsertNode(n2);
      await neo4jClient.upsertNode(n3);

      // Alice owns Project Mesh
      const rel1: GraphRelationship = {
        id: 'rel-1',
        tenant_id: tenantId,
        type: 'PERSON_OWNS_PROJECT',
        source_node_id: 'node-a',
        target_node_id: 'node-b',
        confidence: 1.0,
        evidence_source_ids: [],
        extraction_method: 'test',
        status: 'current',
        properties: {},
      };
      // Project Mesh belongs to DeepMind
      const rel2: GraphRelationship = {
        id: 'rel-2',
        tenant_id: tenantId,
        type: 'PROJECT_HAS_DOCUMENT', // General mapping type
        source_node_id: 'node-b',
        target_node_id: 'node-c',
        confidence: 1.0,
        evidence_source_ids: [],
        extraction_method: 'test',
        status: 'current',
        properties: {},
      };

      await neo4jClient.upsertRelationship(rel1);
      await neo4jClient.upsertRelationship(rel2);

      const expansionSvc = new GraphExpansionService(neo4jClient);
      const hits = [
        {
          document: {
            id: 'node:node-a',
            tenantId,
            resourceId: 'node-a',
            resourceType: 'Person',
            content: 'Alice',
            permissionHash: null,
          },
          score: 1.0,
        },
      ];

      const result = await expansionSvc.expand(tenantId, hits, 2);

      // Depth 2 from Alice should reach Alice, Project Mesh, and DeepMind
      expect(result.nodes.map((n) => n.id)).toContain('node-a');
      expect(result.nodes.map((n) => n.id)).toContain('node-b');
      expect(result.nodes.map((n) => n.id)).toContain('node-c');
      expect(result.relationships.map((r) => r.id)).toContain('rel-1');
      expect(result.relationships.map((r) => r.id)).toContain('rel-2');
    });
  });

  describe('RetrievalOrchestrator', () => {
    it('should coordinate full hybrid retrieval flow', async () => {
      const store = new InMemoryVectorSearchStore();
      const embeddings = new DeterministicEmbeddingProvider();
      const vectorSearch = new VectorSearchService(embeddings, store);
      await vectorSearch.initialize();

      const node: GraphNode = {
        id: 'node-z',
        tenant_id: tenantId,
        type: 'Project',
        canonical_name: 'Project Antigravity',
        aliases: [],
        source_system: 'test',
        source_id: 'anti-src',
        confidence: 1.0,
        status: 'current',
      };
      await neo4jClient.upsertNode(node);
      await vectorSearch.index({
        id: 'node:node-z',
        tenantId,
        resourceId: 'node-z',
        resourceType: 'Project',
        content: 'Project Antigravity',
        permissionHash: null,
        metadata: {},
      });

      const expansionSvc = new GraphExpansionService(neo4jClient);
      const rerankSvc = new RerankingService();
      const orchestrator = new RetrievalOrchestrator(vectorSearch, expansionSvc, rerankSvc);

      const results = await orchestrator.retrieve(tenantId, 'user-1', 'Antigravity');
      expect(results.hits.length).toBeGreaterThan(0);
      expect(results.hits[0].document.id).toBe('node:node-z');
      expect(results.hits[0].calibratedScore).toBeGreaterThan(0.5);
    });
  });
});
