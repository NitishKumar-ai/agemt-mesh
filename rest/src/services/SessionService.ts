import type { Kysely } from 'kysely';
import type { Database } from '@agentmesh/common-persistence';
import { NotFoundException } from '@agentmesh/common';
import type { AgentSession, AgentStep } from './DashboardTypes.js';

export class SessionService {
  constructor(private readonly db: Kysely<Database>) {}

  async listSessions(): Promise<AgentSession[]> {
    const rows = await this.db
      .selectFrom('agent_sessions')
      .selectAll()
      .orderBy('started_at', 'desc')
      .execute();

    return rows.map((row) => ({
      run_id: row.run_id,
      agent_id: row.agent_id,
      started_at: new Date(row.started_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
      last_step: row.last_step,
      status: row.status,
      step_count: row.step_count,
    }));
  }

  async getSessionSteps(runId: string): Promise<AgentStep[]> {
    const session = await this.db
      .selectFrom('agent_sessions')
      .select('run_id')
      .where('run_id', '=', runId)
      .executeTakeFirst();
    if (!session) {
      throw new NotFoundException(`Session ${runId} not found`);
    }

    const rows = await this.db
      .selectFrom('agent_steps')
      .selectAll()
      .where('run_id', '=', runId)
      .orderBy('created_at', 'asc')
      .execute();

    return rows.map((row) => ({
      id: row.id,
      run_id: row.run_id,
      agent_id: row.agent_id,
      step: row.step,
      status: row.status,
      created_at: new Date(row.created_at).toISOString(),
    }));
  }
}
