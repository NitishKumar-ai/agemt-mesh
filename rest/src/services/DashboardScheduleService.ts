import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { Database } from '@agentmesh/common-persistence';
import { NotFoundException } from '@agentmesh/common';
import type { ScheduledTask } from './DashboardTypes.js';

export interface CreateScheduleRequest {
  name: string;
  prompt: string;
  interval: string;
}

export interface UpdateScheduleRequest {
  name?: string;
  prompt?: string;
  interval?: string;
  enabled?: boolean;
}

export class DashboardScheduleService {
  constructor(private readonly db: Kysely<Database>) {}

  private toScheduledTask(row: {
    id: number;
    name: string;
    prompt: string;
    interval: string;
    enabled: number;
    next_run_at: number | null;
    last_run_at: number | null;
    last_status: string | null;
  }): ScheduledTask {
    return {
      id: row.id,
      name: row.name,
      prompt: row.prompt,
      interval: row.interval,
      next_run_at: row.next_run_at ? new Date(row.next_run_at).toISOString() : undefined,
      last_run_at: row.last_run_at ? new Date(row.last_run_at).toISOString() : undefined,
      last_status: row.last_status ?? undefined,
      enabled: row.enabled,
    };
  }

  async listSchedules(): Promise<ScheduledTask[]> {
    const rows = await this.db
      .selectFrom('dashboard_schedules')
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map((row) => this.toScheduledTask(row));
  }

  async createSchedule(req: CreateScheduleRequest): Promise<{ status: string; task_id: number }> {
    const now = Date.now();
    const result = await this.db
      .insertInto('dashboard_schedules')
      .values({
        name: req.name,
        prompt: req.prompt,
        interval: req.interval,
        enabled: 1,
        next_run_at: null,
        last_run_at: null,
        last_status: null,
        created_at: now,
        updated_at: now,
      })
      .executeTakeFirst();

    return { status: 'ok', task_id: Number(result.insertId) };
  }

  async deleteSchedule(taskId: number): Promise<{ status: string }> {
    const schedule = await this.db
      .selectFrom('dashboard_schedules')
      .select('id')
      .where('id', '=', taskId)
      .executeTakeFirst();
    if (!schedule) {
      throw new NotFoundException(`Schedule ${taskId} not found`);
    }

    await this.db.deleteFrom('dashboard_schedules').where('id', '=', taskId).execute();
    return { status: 'ok' };
  }

  async updateSchedule(
    taskId: number,
    req: UpdateScheduleRequest,
  ): Promise<{ status: string }> {
    const schedule = await this.db
      .selectFrom('dashboard_schedules')
      .select('id')
      .where('id', '=', taskId)
      .executeTakeFirst();
    if (!schedule) {
      throw new NotFoundException(`Schedule ${taskId} not found`);
    }

    const updates: Record<string, unknown> = { updated_at: Date.now() };
    if (req.name !== undefined) updates.name = req.name;
    if (req.prompt !== undefined) updates.prompt = req.prompt;
    if (req.interval !== undefined) updates.interval = req.interval;
    if (req.enabled !== undefined) updates.enabled = req.enabled ? 1 : 0;

    await this.db
      .updateTable('dashboard_schedules')
      .set(updates as never)
      .where('id', '=', taskId)
      .execute();

    return { status: 'ok' };
  }

  async runScheduleNow(taskId: number): Promise<{ status: string; workflow_id: string }> {
    const schedule = await this.db
      .selectFrom('dashboard_schedules')
      .selectAll()
      .where('id', '=', taskId)
      .executeTakeFirst();
    if (!schedule) {
      throw new NotFoundException(`Schedule ${taskId} not found`);
    }

    const workflowId = randomUUID();
    const now = Date.now();

    await this.db
      .updateTable('dashboard_schedules')
      .set({ last_run_at: now, last_status: 'running', updated_at: now })
      .where('id', '=', taskId)
      .execute();

    return { status: 'ok', workflow_id: workflowId };
  }
}
