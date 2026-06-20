import { Kysely } from 'kysely';
import type { Database } from '@agentmesh/common-persistence';

export interface CleanupJobResult {
  job: string;
  deleted?: number;
  reset?: number;
  success: boolean;
  error?: string;
}

export class SchedulerJobService {
  constructor(private readonly db: Kysely<Database>) {}

  async dispatch(jobName: string): Promise<CleanupJobResult> {
    switch (jobName) {
      case 'cleanup:executions':
        return this.cleanupStaleExecutions(30);
      case 'cleanup:queue':
        return this.cleanupStaleQueueMessages(7);
      case 'cleanup:schedules':
        return this.resetStuckSchedules(30 * 60 * 1000);
      default:
        return { job: jobName, success: false, error: 'Unknown cleanup job' };
    }
  }

  async cleanupStaleExecutions(daysOld: number): Promise<CleanupJobResult> {
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
    try {
      const result = await this.db
        .deleteFrom('workflow')
        .where('created_on', '<', cutoff as any)
        .executeTakeFirst();

      const deleted = Number(result?.numDeletedRows ?? 0n);
      return { job: 'cleanup:executions', deleted, success: true };
    } catch (error) {
      return {
        job: 'cleanup:executions',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async cleanupStaleQueueMessages(daysOld: number): Promise<CleanupJobResult> {
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
    try {
      const result = await this.db
        .deleteFrom('queue_message')
        .where('created_on', '<', cutoff as any)
        .executeTakeFirst();

      const deleted = Number(result?.numDeletedRows ?? 0n);
      return { job: 'cleanup:queue', deleted, success: true };
    } catch (error) {
      return {
        job: 'cleanup:queue',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async resetStuckSchedules(timeoutMs: number): Promise<CleanupJobResult> {
    const cutoff = Date.now() - timeoutMs;
    try {
      const result = await this.db
        .updateTable('dashboard_schedules')
        .set({ last_status: 'TIMEOUT' })
        .where('last_run_at', '<', cutoff)
        .where('enabled', '=', 1)
        .executeTakeFirst();

      const reset = Number(result?.numUpdatedRows ?? 0n);
      return { job: 'cleanup:schedules', reset, success: true };
    } catch (error) {
      return {
        job: 'cleanup:schedules',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
