import { EmbeddingProvider, EmbeddingPurpose } from '@agentmesh/common';

type FetchLike = typeof fetch;

interface RetryOptions {
  maxAttempts?: number;
  timeoutMs?: number;
}

interface OpenAIEmbeddingResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
  error?: { message?: string };
}

interface GeminiEmbeddingResponse {
  embedding?: { values?: number[] };
  error?: { message?: string };
}

abstract class RetryingEmbeddingProvider implements EmbeddingProvider {
  abstract readonly id: string;
  abstract readonly model: string;
  abstract readonly dimensions: number;

  constructor(
    protected readonly fetchImpl: FetchLike = fetch,
    protected readonly retryOptions: RetryOptions = {},
  ) {}

  abstract embed(text: string, purpose?: EmbeddingPurpose): Promise<number[]>;
  abstract embedBatch(texts: string[], purpose?: EmbeddingPurpose): Promise<number[][]>;

  protected async request(url: string, init: RequestInit): Promise<Response> {
    const attempts = this.retryOptions.maxAttempts ?? 4;
    const timeoutMs = this.retryOptions.timeoutMs ?? 30_000;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await this.fetchImpl(url, { ...init, signal: controller.signal });
        if (response.ok) return response;

        const body = await response.text();
        const error = new Error(`Embedding request failed (${response.status}): ${body}`);
        if (response.status !== 429 && response.status < 500) throw error;
        lastError = error;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt === attempts) throw lastError;
      } finally {
        clearTimeout(timeout);
      }

      const retryAfterMs = 250 * 2 ** (attempt - 1) + Math.floor(Math.random() * 100);
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
    }

    throw lastError ?? new Error('Embedding request failed');
  }

  protected validateEmbedding(embedding: number[] | undefined): number[] {
    if (
      !embedding ||
      embedding.length !== this.dimensions ||
      embedding.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(
        `Embedding provider returned an invalid vector; expected ${this.dimensions} dimensions`,
      );
    }
    return embedding;
  }
}

export interface OpenAIEmbeddingProviderOptions extends RetryOptions {
  apiKey: string;
  model?: string;
  dimensions?: number;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

export class OpenAIEmbeddingProvider extends RetryingEmbeddingProvider {
  readonly id = 'openai';
  readonly model: string;
  readonly dimensions: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: OpenAIEmbeddingProviderOptions) {
    super(options.fetchImpl, options);
    if (!options.apiKey) throw new Error('OPENAI_API_KEY is required for OpenAI embeddings');
    this.apiKey = options.apiKey;
    this.model = options.model ?? 'text-embedding-3-small';
    this.dimensions = options.dimensions ?? 1536;
    this.baseUrl = (options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  }

  async embed(text: string, purpose: EmbeddingPurpose = 'document'): Promise<number[]> {
    return (await this.embedBatch([text], purpose))[0]!;
  }

  async embedBatch(texts: string[], _purpose: EmbeddingPurpose = 'document'): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (texts.some((text) => text.trim().length === 0)) {
      throw new Error('Embedding input cannot be empty');
    }

    const requestBody: Record<string, unknown> = {
      input: texts,
      model: this.model,
      encoding_format: 'float',
    };
    if (this.model.startsWith('text-embedding-3-')) {
      requestBody.dimensions = this.dimensions;
    }
    const response = await this.request(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    const body = (await response.json()) as OpenAIEmbeddingResponse;
    if (body.error?.message) throw new Error(body.error.message);

    const ordered = [...(body.data ?? [])].sort(
      (left, right) => (left.index ?? 0) - (right.index ?? 0),
    );
    if (ordered.length !== texts.length) {
      throw new Error(`OpenAI returned ${ordered.length} embeddings for ${texts.length} inputs`);
    }
    return ordered.map((item) => this.validateEmbedding(item.embedding));
  }
}

export interface GeminiEmbeddingProviderOptions extends RetryOptions {
  apiKey: string;
  model?: string;
  dimensions?: number;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  concurrency?: number;
}

export class GeminiEmbeddingProvider extends RetryingEmbeddingProvider {
  readonly id = 'gemini';
  readonly model: string;
  readonly dimensions: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly concurrency: number;

  constructor(options: GeminiEmbeddingProviderOptions) {
    super(options.fetchImpl, options);
    if (!options.apiKey) throw new Error('GEMINI_API_KEY is required for Gemini embeddings');
    this.apiKey = options.apiKey;
    this.model = options.model ?? 'gemini-embedding-001';
    this.dimensions = options.dimensions ?? 1536;
    this.baseUrl = (options.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(
      /\/$/,
      '',
    );
    this.concurrency = Math.max(1, options.concurrency ?? 8);
  }

  async embed(text: string, purpose: EmbeddingPurpose = 'document'): Promise<number[]> {
    if (text.trim().length === 0) throw new Error('Embedding input cannot be empty');
    const response = await this.request(`${this.baseUrl}/models/${this.model}:embedContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({
        model: `models/${this.model}`,
        content: { parts: [{ text }] },
        taskType: purpose === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
        outputDimensionality: this.dimensions,
      }),
    });
    const body = (await response.json()) as GeminiEmbeddingResponse;
    if (body.error?.message) throw new Error(body.error.message);
    return this.validateEmbedding(body.embedding?.values);
  }

  async embedBatch(texts: string[], purpose: EmbeddingPurpose = 'document'): Promise<number[][]> {
    const results = new Array<number[]>(texts.length);
    for (let offset = 0; offset < texts.length; offset += this.concurrency) {
      const batch = texts.slice(offset, offset + this.concurrency);
      const embeddings = await Promise.all(batch.map((text) => this.embed(text, purpose)));
      embeddings.forEach((embedding, index) => {
        results[offset + index] = embedding;
      });
    }
    return results;
  }
}
