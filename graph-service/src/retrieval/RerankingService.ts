export class RerankingService {
  constructor(private readonly llms?: any) {}

  /**
   * Scores the relevance of a content segment to the query.
   * If LLMs are configured, it uses LLM evaluation; otherwise, it falls back to token overlap.
   */
  async scoreRelevance(query: string, content: string): Promise<number> {
    const hasKeys = !!(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY);
    if (!this.llms || !hasKeys) {
      return this.fallbackScore(query, content);
    }

    try {
      const prompt = `
You are a relevance evaluator. Score how relevant the content segment below is to the search query on a scale from 0.0 (completely irrelevant) to 1.0 (highly relevant).
Answer ONLY with a decimal number between 0.0 and 1.0. Do not include any reasoning, introduction, or formatting.

Query: "${query}"
Content Segment: "${content}"

Relevance Score:`;

      // Use a cheap model for evaluation, e.g., gemini-1.5-flash or claude-3-haiku
      const model = process.env.GEMINI_API_KEY ? 'gemini-1.5-flash' : 'claude-3-haiku-20240307';
      const fakeTask = { taskId: 'rerank-score', workflowInstanceId: 'retrieval' };
      const response = await this.llms.chatComplete(fakeTask, {
        model,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = (response?.result || response?.content || '').trim();
      const score = parseFloat(text);
      if (!isNaN(score) && score >= 0 && score <= 1) {
        return score;
      }
    } catch (err) {
      console.warn('[RerankingService] LLM reranking failed, falling back to token overlap:', err);
    }

    return this.fallbackScore(query, content);
  }

  /**
   * Token-overlap Jaccard similarity fallback.
   */
  private fallbackScore(query: string, content: string): number {
    const qWords = new Set(query.toLowerCase().match(/\w+/g) || []);
    const cWords = new Set(content.toLowerCase().match(/\w+/g) || []);
    if (qWords.size === 0 || cWords.size === 0) return 0.0;

    let intersection = 0;
    for (const w of qWords) {
      if (cWords.has(w)) intersection++;
    }

    const union = qWords.size + cWords.size - intersection;
    return intersection / union;
  }

  /**
   * Reranks and returns hits scored using the blended formula.
   */
  async rerank(
    query: string,
    hits: any[],
    alpha = 0.5,
  ): Promise<Array<any & { rerankScore: number; blendedScore: number }>> {
    const reranked = await Promise.all(
      hits.map(async (hit) => {
        const rerankScore = await this.scoreRelevance(query, hit.document.content);
        const blendedScore = alpha * hit.score + (1 - alpha) * rerankScore;
        return {
          ...hit,
          rerankScore,
          blendedScore,
        };
      }),
    );

    // Sort by blendedScore descending
    return reranked.sort((a, b) => b.blendedScore - a.blendedScore);
  }
}
