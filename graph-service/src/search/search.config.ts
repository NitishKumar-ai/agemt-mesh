import { EmbeddingProvider, VectorSearchStore } from '@agentmesh/common';
import { DeterministicEmbeddingProvider } from './DeterministicEmbeddingProvider.js';
import { GeminiEmbeddingProvider, OpenAIEmbeddingProvider } from './HttpEmbeddingProviders.js';
import { InMemoryVectorSearchStore } from './InMemoryVectorSearchStore.js';
import { PgVectorSearchStore } from './PgVectorSearchStore.js';

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function createEmbeddingProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): EmbeddingProvider {
  const provider =
    env.EMBEDDING_PROVIDER ??
    (env.OPENAI_API_KEY ? 'openai' : env.GEMINI_API_KEY ? 'gemini' : 'deterministic');

  if (provider === 'openai') {
    return new OpenAIEmbeddingProvider({
      apiKey: env.OPENAI_API_KEY ?? '',
      model: env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
      dimensions: positiveInteger(env.EMBEDDING_DIMENSIONS, 1536),
      baseUrl: env.OPENAI_BASE_URL,
      timeoutMs: positiveInteger(env.EMBEDDING_TIMEOUT_MS, 30_000),
      maxAttempts: positiveInteger(env.EMBEDDING_MAX_ATTEMPTS, 4),
    });
  }

  if (provider === 'gemini') {
    return new GeminiEmbeddingProvider({
      apiKey: env.GEMINI_API_KEY ?? '',
      model: env.EMBEDDING_MODEL ?? 'gemini-embedding-001',
      dimensions: positiveInteger(env.EMBEDDING_DIMENSIONS, 1536),
      timeoutMs: positiveInteger(env.EMBEDDING_TIMEOUT_MS, 30_000),
      maxAttempts: positiveInteger(env.EMBEDDING_MAX_ATTEMPTS, 4),
      concurrency: positiveInteger(env.EMBEDDING_CONCURRENCY, 8),
    });
  }

  if (provider !== 'deterministic') {
    throw new Error(`Unsupported EMBEDDING_PROVIDER: ${provider}`);
  }
  if (env.NODE_ENV === 'production' && env.ALLOW_DETERMINISTIC_EMBEDDINGS !== 'true') {
    throw new Error(
      'Deterministic embeddings are disabled in production; configure OpenAI or Gemini',
    );
  }
  return new DeterministicEmbeddingProvider(positiveInteger(env.EMBEDDING_DIMENSIONS, 256));
}

export function createVectorSearchStoreFromEnv(
  embeddingProvider: EmbeddingProvider,
  env: NodeJS.ProcessEnv = process.env,
): VectorSearchStore {
  const backend = env.VECTOR_STORE ?? (env.VECTOR_DATABASE_URL ? 'pgvector' : 'memory');
  if (backend === 'pgvector') {
    if (!env.VECTOR_DATABASE_URL) {
      throw new Error('VECTOR_DATABASE_URL is required when VECTOR_STORE=pgvector');
    }
    return new PgVectorSearchStore({
      connectionString: env.VECTOR_DATABASE_URL,
      dimensions: embeddingProvider.dimensions,
      provider: embeddingProvider.id,
      model: embeddingProvider.model,
      hnswEfSearch: positiveInteger(env.VECTOR_HNSW_EF_SEARCH, 100),
    });
  }
  if (backend !== 'memory') throw new Error(`Unsupported VECTOR_STORE: ${backend}`);
  if (env.NODE_ENV === 'production' && env.ALLOW_IN_MEMORY_VECTOR_STORE !== 'true') {
    throw new Error('In-memory vector search is disabled in production; configure pgvector');
  }
  return new InMemoryVectorSearchStore();
}
