import { EmbeddingProvider } from '@agentmesh/common';

/**
 * Local embedding implementation used when no external model is configured.
 * Tokens are hashed into a fixed-size signed feature vector and normalized,
 * producing stable embeddings suitable for local development and tests.
 */
export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'deterministic';
  readonly model = 'signed-feature-hash-v1';

  constructor(public readonly dimensions = 256) {
    if (!Number.isInteger(dimensions) || dimensions <= 0) {
      throw new Error('Embedding dimensions must be a positive integer');
    }
  }

  async embed(text: string): Promise<number[]> {
    const vector = new Array<number>(this.dimensions).fill(0);
    const tokens = text.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];

    for (const token of tokens) {
      const hash = this.hash(token);
      const index = hash % this.dimensions;
      const sign = (hash & 1) === 0 ? 1 : -1;
      vector[index] = (vector[index] ?? 0) + sign;
    }

    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (magnitude === 0) return vector;
    return vector.map((value) => value / magnitude);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embed(text)));
  }

  private hash(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
}
