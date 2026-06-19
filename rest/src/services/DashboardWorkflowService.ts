import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { Database } from '@agentmesh/common-persistence';
import { NotFoundException } from '@agentmesh/common';
import type { WorkflowRun, DlqEvent } from './DashboardTypes.js';

export class DashboardWorkflowService {
  constructor(private readonly db: Kysely<Database>) {}

  async listWorkflows(): Promise<{ workflows: WorkflowRun[]; dlq: DlqEvent[] }> {
    const [sessionRows, dlqRows] = await Promise.all([
      this.db.selectFrom('agent_sessions').selectAll().orderBy('started_at', 'desc').execute(),
      this.db.selectFrom('dlq_events').selectAll().orderBy('created_at', 'desc').execute(),
    ]);

    const workflows: WorkflowRun[] = sessionRows.map((row) => ({
      run_id: row.run_id,
      agent_id: row.agent_id,
      started_at: new Date(row.started_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
      last_step: row.last_step,
      status: row.status,
      step_count: row.step_count,
    }));

    const dlq: DlqEvent[] = dlqRows.map((row) => ({
      id: row.id,
      run_id: row.run_id,
      agent_id: row.agent_id,
      error: row.error,
      created_at: new Date(row.created_at).toISOString(),
    }));

    return { workflows, dlq };
  }

  async retryWorkflow(runId: string): Promise<{ status: string; new_workflow_id: string }> {
    const session = await this.db
      .selectFrom('agent_sessions')
      .selectAll()
      .where('run_id', '=', runId)
      .executeTakeFirst();
    if (!session) {
      throw new NotFoundException(`Workflow ${runId} not found`);
    }

    const newWorkflowId = randomUUID();
    const now = Date.now();
    await this.db
      .insertInto('agent_sessions')
      .values({
        run_id: newWorkflowId,
        agent_id: session.agent_id,
        started_at: now,
        updated_at: now,
        last_step: 'retry_queued',
        status: 'running',
        step_count: 0,
      })
      .execute();

    return { status: 'retried', new_workflow_id: newWorkflowId };
  }
}
