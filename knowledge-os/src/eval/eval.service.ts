
import { Injectable } from '@nestjs/common';

@Injectable()
export class EvaluationHarnessService {
  async runDataQualityChecks(tenantId: string) {
    // TODO: Implement DQ checks
  }

  async computeRetrievalMetrics(tenantId: string, queries: string[]) {
    // TODO: Use pgvector / postgres for retrieval metric testing
  }
}
