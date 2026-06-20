import { SearchTextOptions, VectorSearchService } from './VectorSearchService.js';

export interface RetrievalEvaluationCase {
  id: string;
  tenantId: string;
  query: string;
  expectedResourceIds: string[];
  options?: SearchTextOptions;
}

export interface RetrievalEvaluationReport {
  cases: number;
  k: number;
  recallAtK: number;
  precisionAtK: number;
  meanReciprocalRank: number;
  failures: Array<{
    id: string;
    query: string;
    expectedResourceIds: string[];
    returnedResourceIds: string[];
  }>;
}

export class RetrievalEvaluationService {
  constructor(private readonly searchService: VectorSearchService) {}

  async evaluate(cases: RetrievalEvaluationCase[], k = 10): Promise<RetrievalEvaluationReport> {
    if (k <= 0 || !Number.isInteger(k)) throw new Error('Evaluation k must be a positive integer');
    if (cases.length === 0) {
      return {
        cases: 0,
        k,
        recallAtK: 0,
        precisionAtK: 0,
        meanReciprocalRank: 0,
        failures: [],
      };
    }

    let recallTotal = 0;
    let precisionTotal = 0;
    let reciprocalRankTotal = 0;
    const failures: RetrievalEvaluationReport['failures'] = [];

    for (const testCase of cases) {
      const hits = await this.searchService.search(testCase.tenantId, testCase.query, {
        ...testCase.options,
        limit: k,
      });
      const returned = hits.map((hit) => hit.document.resourceId);
      const expected = new Set(testCase.expectedResourceIds);
      const relevantReturned = returned.filter((id) => expected.has(id));
      recallTotal += expected.size === 0 ? 1 : relevantReturned.length / expected.size;
      precisionTotal += relevantReturned.length / k;

      const firstRelevantIndex = returned.findIndex((id) => expected.has(id));
      reciprocalRankTotal += firstRelevantIndex === -1 ? 0 : 1 / (firstRelevantIndex + 1);
      if (relevantReturned.length < expected.size) {
        failures.push({
          id: testCase.id,
          query: testCase.query,
          expectedResourceIds: testCase.expectedResourceIds,
          returnedResourceIds: returned,
        });
      }
    }

    return {
      cases: cases.length,
      k,
      recallAtK: recallTotal / cases.length,
      precisionAtK: precisionTotal / cases.length,
      meanReciprocalRank: reciprocalRankTotal / cases.length,
      failures,
    };
  }
}
