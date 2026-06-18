import { Kysely, Transaction, sql } from 'kysely';
import { MetadataDAO, Database, WorkflowDefSummary } from '@agentmesh/common-persistence';
import { TaskDef, WorkflowDef, EventHandler, NotFoundException, ConflictException } from '@agentmesh/common';

export class SqliteMetadataDAO implements MetadataDAO {
  constructor(private readonly db: Kysely<Database>) {}

  async createTaskDef(taskDef: TaskDef): Promise<TaskDef> {
    return this.insertOrUpdateTaskDef(taskDef);
  }

  async updateTaskDef(taskDef: TaskDef): Promise<TaskDef> {
    return this.insertOrUpdateTaskDef(taskDef);
  }

  private async insertOrUpdateTaskDef(taskDef: TaskDef): Promise<TaskDef> {
    const updateResult = await this.db
      .updateTable('meta_task_def')
      .set({
        json_data: JSON.stringify(taskDef),
      })
      .where('name', '=', taskDef.name!)
      .executeTakeFirst();

    if (updateResult.numUpdatedRows === 0n) {
      await this.db
        .insertInto('meta_task_def')
        .values({
          name: taskDef.name!,
          json_data: JSON.stringify(taskDef),
        })
        .execute();
    }
    return taskDef;
  }

  async getTaskDef(name: string): Promise<TaskDef | undefined> {
    const row = await this.db
      .selectFrom('meta_task_def')
      .select('json_data')
      .where('name', '=', name)
      .executeTakeFirst();

    return row ? JSON.parse(row.json_data) : undefined;
  }

  async getAllTaskDefs(): Promise<TaskDef[]> {
    const rows = await this.db.selectFrom('meta_task_def').select('json_data').execute();
    return rows.map((r) => JSON.parse(r.json_data));
  }

  async removeTaskDef(name: string): Promise<void> {
    const result = await this.db
      .deleteFrom('meta_task_def')
      .where('name', '=', name)
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new NotFoundException(`No such task definition`);
    }
  }

  async createWorkflowDef(def: WorkflowDef): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      const exists = await tx
        .selectFrom('meta_workflow_def')
        .select('id')
        .where('name', '=', def.name!)
        .where('version', '=', def.version!)
        .executeTakeFirst();

      if (exists) {
        throw new ConflictException(`Workflow with ${def.name} already exists!`);
      }

      await this.insertOrUpdateWorkflowDef(tx, def);
    });
  }

  async updateWorkflowDef(def: WorkflowDef): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      await this.insertOrUpdateWorkflowDef(tx, def);
    });
  }

  private async insertOrUpdateWorkflowDef(tx: Transaction<Database>, def: WorkflowDef): Promise<void> {
    const latestRow = await tx
      .selectFrom('meta_workflow_def')
      .select((db) => db.fn.max('version').as('version'))
      .where('name', '=', def.name!)
      .executeTakeFirst();

    const currentMaxVersion = Number(latestRow?.version || 0);

    const exists = await tx
      .selectFrom('meta_workflow_def')
      .select('id')
      .where('name', '=', def.name!)
      .where('version', '=', def.version!)
      .executeTakeFirst();

    if (!exists) {
      await tx
        .insertInto('meta_workflow_def')
        .values({
          name: def.name!,
          version: def.version!,
          json_data: JSON.stringify(def),
          latest_version: 0,
        })
        .execute();
    } else {
      await tx
        .updateTable('meta_workflow_def')
        .set({ json_data: JSON.stringify(def) })
        .where('name', '=', def.name!)
        .where('version', '=', def.version!)
        .execute();
    }

    const newMaxVersion = Math.max(currentMaxVersion, def.version!);
    await tx
      .updateTable('meta_workflow_def')
      .set({ latest_version: newMaxVersion })
      .where('name', '=', def.name!)
      .execute();
  }

  async getLatestWorkflowDef(name: string): Promise<WorkflowDef | undefined> {
    const row = await this.db
      .selectFrom('meta_workflow_def')
      .select('json_data')
      .where('name', '=', name)
      .whereRef('version', '=', 'latest_version')
      .executeTakeFirst();

    return row ? JSON.parse(row.json_data) : undefined;
  }

  async getWorkflowDef(name: string, version: number): Promise<WorkflowDef | undefined> {
    const row = await this.db
      .selectFrom('meta_workflow_def')
      .select('json_data')
      .where('name', '=', name)
      .where('version', '=', version)
      .executeTakeFirst();

    return row ? JSON.parse(row.json_data) : undefined;
  }

  async removeWorkflowDef(name: string, version: number): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      const result = await tx
        .deleteFrom('meta_workflow_def')
        .where('name', '=', name)
        .where('version', '=', version)
        .executeTakeFirst();

      if (result.numDeletedRows === 0n) {
        throw new NotFoundException(`No such workflow definition: ${name} version: ${version}`);
      }

      const latestRow = await tx
        .selectFrom('meta_workflow_def')
        .select((db) => db.fn.max('version').as('version'))
        .where('name', '=', name)
        .executeTakeFirst();

      if (latestRow?.version != null) {
        await tx
          .updateTable('meta_workflow_def')
          .set({ latest_version: Number(latestRow.version) })
          .where('name', '=', name)
          .execute();
      }
    });
  }

  async getAllWorkflowDefs(): Promise<WorkflowDef[]> {
    const rows = await this.db
      .selectFrom('meta_workflow_def')
      .select('json_data')
      .orderBy('name')
      .orderBy('version')
      .execute();

    return rows.map((r) => JSON.parse(r.json_data));
  }

  async getAllWorkflowDefsLatestVersions(): Promise<WorkflowDef[]> {
    const rows = await this.db
      .selectFrom('meta_workflow_def as wd')
      .select('wd.json_data')
      .where('wd.version', '=', (eb) =>
        eb
          .selectFrom('meta_workflow_def as wd2')
          .select((eb2) => eb2.fn.max('version').as('max_version'))
          .whereRef('wd2.name', '=', 'wd.name'),
      )
      .execute();

    return rows.map((r) => JSON.parse(r.json_data));
  }

  async getWorkflowNames(): Promise<string[]> {
    const rows = await this.db
      .selectFrom('meta_workflow_def')
      .select('name')
      .distinct()
      .orderBy('name')
      .execute();

    return rows.map((r) => r.name);
  }

  async addEventHandler(handler: EventHandler): Promise<void> {
    const existing = await this.db
      .selectFrom('meta_event_handler')
      .select('id')
      .where('name', '=', handler.name)
      .executeTakeFirst();

    if (existing) {
      throw new ConflictException(`EventHandler ${handler.name} already exists`);
    }

    await this.db
      .insertInto('meta_event_handler')
      .values({
        name: handler.name,
        event: handler.event,
        active: handler.active ? sql<boolean>`1` : sql<boolean>`0`,
        json_data: JSON.stringify(handler),
      })
      .execute();
  }

  async updateEventHandler(handler: EventHandler): Promise<void> {
    const result = await this.db
      .updateTable('meta_event_handler')
      .set({
        event: handler.event,
        active: handler.active ? sql<boolean>`1` : sql<boolean>`0`,
        json_data: JSON.stringify(handler),
      })
      .where('name', '=', handler.name)
      .executeTakeFirst();

    if (result.numUpdatedRows === 0n) {
      throw new NotFoundException(`EventHandler ${handler.name} not found`);
    }
  }

  async removeEventHandlerStatus(name: string): Promise<void> {
    const result = await this.db
      .deleteFrom('meta_event_handler')
      .where('name', '=', name)
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new NotFoundException(`EventHandler ${name} not found`);
    }
  }

  async getAllEventHandlers(): Promise<EventHandler[]> {
    const rows = await this.db
      .selectFrom('meta_event_handler')
      .select('json_data')
      .execute();

    return rows.map((r) => JSON.parse(r.json_data));
  }

  async getEventHandlersForEvent(event: string, activeOnly: boolean): Promise<EventHandler[]> {
    let query = this.db
      .selectFrom('meta_event_handler')
      .select('json_data')
      .where('event', '=', event);

    if (activeOnly) {
      query = query.where('active', '=', sql<boolean>`1`);
    }

    const rows = await query.execute();
    return rows.map((r) => JSON.parse(r.json_data));
  }

  async getWorkflowVersions(name: string): Promise<WorkflowDefSummary[]> {
    const rows = await this.db
      .selectFrom('meta_workflow_def')
      .select(['version', 'created_on', 'modified_on'])
      .where('name', '=', name)
      .orderBy('version')
      .execute();

    return rows.map((r) => ({
      name,
      version: r.version,
      createTime: r.created_on ? new Date(r.created_on as string | Date).getTime() : undefined,
    }));
  }
}
