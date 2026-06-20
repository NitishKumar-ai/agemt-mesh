import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import {
  GeminiEmbeddingProvider,
  OpenAIEmbeddingProvider,
} from '../src/search/HttpEmbeddingProviders.js';
import { DeterministicEmbeddingProvider } from '../src/search/DeterministicEmbeddingProvider.js';
import { InMemoryVectorSearchStore } from '../src/search/InMemoryVectorSearchStore.js';
import { PgVectorSearchStore } from '../src/search/PgVectorSearchStore.js';
import { RetrievalEvaluationService } from '../src/search/RetrievalEvaluationService.js';
import { createEmbeddingProviderFromEnv } from '../src/search/search.config.js';
import { VectorSearchService } from '../src/search/VectorSearchService.js';
import crypto from 'node:crypto';

interface CapturedRequest {
  url: string;
  headers: IncomingMessage['headers'];
  body: Record<string, unknown>;
}

describe('production embedding providers', () => {
  let server: Server;
  let baseUrl: string;
  const requests: CapturedRequest[] = [];

  beforeAll(async () => {
    server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
      requests.push({ url: request.url ?? '', headers: request.headers, body });

      response.setHeader('Content-Type', 'application/json');
      if (request.url === '/v1/embeddings') {
        const inputs = body.input as string[];
        response.end(
          JSON.stringify({
            data: inputs.map((_input, index) => ({ index, embedding: [index + 1, index + 2] })),
          }),
        );
        return;
      }
      response.end(JSON.stringify({ embedding: { values: [0.25, 0.75] } }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it('batches OpenAI embeddings with explicit dimensions', async () => {
    const provider = new OpenAIEmbeddingProvider({
      apiKey: 'test-openai-key',
      baseUrl: `${baseUrl}/v1`,
      dimensions: 2,
      maxAttempts: 1,
    });

    await expect(provider.embedBatch(['alpha', 'beta'])).resolves.toEqual([
      [1, 2],
      [2, 3],
    ]);
    const request = requests.find((item) => item.url === '/v1/embeddings')!;
    expect(request.headers.authorization).toBe('Bearer test-openai-key');
    expect(request.body).toMatchObject({
      input: ['alpha', 'beta'],
      dimensions: 2,
      encoding_format: 'float',
    });
  });

  it('sends Gemini retrieval task types and output dimensions', async () => {
    const provider = new GeminiEmbeddingProvider({
      apiKey: 'test-gemini-key',
      baseUrl: `${baseUrl}/v1beta`,
      dimensions: 2,
      maxAttempts: 1,
    });

    await expect(provider.embed('atlas roadmap', 'query')).resolves.toEqual([0.25, 0.75]);
    const request = requests.find((item) => item.url.includes(':embedContent'))!;
    expect(request.headers['x-goog-api-key']).toBe('test-gemini-key');
    expect(request.body).toMatchObject({
      taskType: 'RETRIEVAL_QUERY',
      outputDimensionality: 2,
    });
  });

  it('fails closed when deterministic embeddings are selected in production', () => {
    expect(() =>
      createEmbeddingProviderFromEnv({
        NODE_ENV: 'production',
        EMBEDDING_PROVIDER: 'deterministic',
      }),
    ).toThrow('Deterministic embeddings are disabled in production');
  });
});

describe('vector reindexing and retrieval evaluation', () => {
  it('replaces a tenant index in batches and computes recall and MRR', async () => {
    const search = new VectorSearchService(
      new DeterministicEmbeddingProvider(128),
      new InMemoryVectorSearchStore(),
    );
    await search.index({
      id: 'old',
      tenantId: 'tenant-a',
      resourceId: 'old',
      resourceType: 'Document',
      content: 'obsolete content',
      permissionHash: null,
      metadata: {},
    });

    const report = await search.reindex('tenant-a', [
      {
        id: 'atlas',
        tenantId: 'tenant-a',
        resourceId: 'atlas',
        resourceType: 'Project',
        content: 'Project Atlas database migration roadmap',
        permissionHash: null,
        metadata: {},
      },
      {
        id: 'checkout',
        tenantId: 'tenant-a',
        resourceId: 'checkout',
        resourceType: 'Incident',
        content: 'Checkout latency incident postmortem',
        permissionHash: null,
        metadata: {},
      },
    ]);

    expect(report.indexed).toBe(2);
    expect(await search.count('tenant-a')).toBe(2);
    const evaluator = new RetrievalEvaluationService(search);
    const evaluation = await evaluator.evaluate(
      [
        {
          id: 'atlas-query',
          tenantId: 'tenant-a',
          query: 'Atlas database migration',
          expectedResourceIds: ['atlas'],
        },
        {
          id: 'checkout-query',
          tenantId: 'tenant-a',
          query: 'checkout incident latency',
          expectedResourceIds: ['checkout'],
        },
      ],
      1,
    );

    expect(evaluation.recallAtK).toBe(1);
    expect(evaluation.meanReciprocalRank).toBe(1);
    expect(evaluation.failures).toEqual([]);
  });
});

const pgvectorUrl = process.env.TEST_VECTOR_DATABASE_URL;
const describePgvector = pgvectorUrl ? describe : describe.skip;

describePgvector('pgvector contract', () => {
  it('persists, filters, and searches vectors in PostgreSQL', async () => {
    const tenantId = `test-${crypto.randomUUID()}`;
    const store = new PgVectorSearchStore({
      connectionString: pgvectorUrl!,
      dimensions: 3,
      provider: 'contract-test',
      model: 'three-dimensional',
    });

    try {
      await store.initialize();
      await store.upsertBatch([
        {
          id: 'public',
          tenantId,
          resourceId: 'public',
          resourceType: 'Document',
          content: 'public',
          embedding: [1, 0, 0],
          permissionHash: null,
          metadata: {},
        },
        {
          id: 'restricted',
          tenantId,
          resourceId: 'restricted',
          resourceType: 'Document',
          content: 'restricted',
          embedding: [0.99, 0.01, 0],
          permissionHash: 'executive',
          metadata: {},
        },
      ]);

      const publicHits = await store.search({
        tenantId,
        embedding: [1, 0, 0],
        includePublic: true,
      });
      expect(publicHits.map((hit) => hit.document.resourceId)).toEqual(['public']);

      const authorizedHits = await store.search({
        tenantId,
        embedding: [1, 0, 0],
        allowedPermissionHashes: ['executive'],
      });
      expect(authorizedHits.map((hit) => hit.document.resourceId)).toContain('restricted');

      const adminHits = await store.search({
        tenantId,
        embedding: [1, 0, 0],
        bypassPermissions: true,
      });
      expect(adminHits.map((hit) => hit.document.resourceId)).toEqual(
        expect.arrayContaining(['public', 'restricted']),
      );
    } finally {
      await store.deleteByTenant(tenantId);
      await store.close();
    }
  });
});
