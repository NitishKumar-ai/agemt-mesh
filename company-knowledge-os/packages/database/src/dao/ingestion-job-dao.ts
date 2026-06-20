import { Kysely } from 'kysely';
import { Database, IngestionJobTable } from '../schema/schema';

export class IngestionJobDAO {
  constructor(private db: Kysely<Database>) {}

  async createJob(job: IngestionJobTable): Promise<void> {
    await this.db
      .insertInto('ingestion_jobs')
      .values(job)
      .execute();
  }

  async updateJobStatus(
    jobId: string,
    status: IngestionJobTable['status'],
    processedAt: Date | null = null,
    errorMessage: string | null = null
  ): Promise<void> {
    const updateQuery: any = { status };
    if (processedAt) updateQuery.processed_at = processedAt;
    if (errorMessage) updateQuery.error_message = errorMessage;

    await this.db
      .updateTable('ingestion_jobs')
      .set(updateQuery)
      .where('job_id', '=', jobId)
      .execute();
  }

  async getJob(jobId: string): Promise<IngestionJobTable | undefined> {
    return this.db
      .selectFrom('ingestion_jobs')
      .selectAll()
      .where('job_id', '=', jobId)
      .executeTakeFirst();
  }

  async getJobStats(): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    const counts = await this.db
      .selectFrom('ingestion_jobs')
      .select(['status'])
      .execute();

    const stats = {
      total: counts.length,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };

    for (const row of counts) {
      if (row.status === 'pending') stats.pending++;
      else if (row.status === 'processing') stats.processing++;
      else if (row.status === 'completed') stats.completed++;
      else if (row.status === 'failed') stats.failed++;
    }

    return stats;
  }
}
