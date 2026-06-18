import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import DatabaseDriver from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from '@agentmesh/common-persistence';
import { InitialSchemaMigration } from '@agentmesh/common-persistence';
import { SqliteMetadataDAO } from '@agentmesh/sqlite-persistence';
import { MetadataService } from '../../src/services/MetadataService.js';
import type { TaskDef, WorkflowDef } from '@agentmesh/common';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createDb(): any {
  return new Kysely<Database>({
    dialect: new SqliteDialect({ database: new DatabaseDriver(':memory:') }),
  });
}

describe('MetadataService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let service: MetadataService;

  beforeAll(async () => {
    db = createDb();
    await InitialSchemaMigration.up(db);
    const dao = new SqliteMetadataDAO(db);
    service = new MetadataService(dao);
  });

  afterAll(async () => {
    await db.destroy();
  });

  const sampleTaskDef: TaskDef = {
    name: 'test_task',
    ownerEmail: 'test@example.com',
    timeoutSeconds: 300,
  };

  const sampleWorkflowDef: WorkflowDef = {
    name: 'test_workflow',
    version: 1,
    ownerEmail: 'test@example.com',
    tasks: [{ name: 'test_task', taskReferenceName: 't1', type: 'SIMPLE' }],
  };

  describe('TaskDef CRUD', () => {
    it('registerTaskDefs creates a new task def', async () => {
      await service.registerTaskDefs([sampleTaskDef]);
      const got = await service.getTaskDef('test_task');
      expect(got).toBeDefined();
      expect(got!.name).toBe('test_task');
    });

    it('registerTaskDefs throws if task def already exists', async () => {
      await expect(service.registerTaskDefs([sampleTaskDef])).rejects.toThrow('already exists');
    });

    it('getTaskDefs returns all task defs', async () => {
      const defs = await service.getTaskDefs();
      expect(defs.length).toBeGreaterThanOrEqual(1);
    });

    it('getTaskDef returns undefined for unknown task type', async () => {
      const got = await service.getTaskDef('nonexistent');
      expect(got).toBeUndefined();
    });

    it('updateTaskDef updates an existing task def', async () => {
      const updated: TaskDef = { ...sampleTaskDef, timeoutSeconds: 600 };
      await service.updateTaskDef(updated);
      const got = await service.getTaskDef('test_task');
      expect(got!.timeoutSeconds).toBe(600);
    });

    it('removeTaskDef removes a task def', async () => {
      await service.removeTaskDef('test_task');
      const got = await service.getTaskDef('test_task');
      expect(got).toBeUndefined();
    });
  });

  describe('WorkflowDef CRUD', () => {
    it('registerWorkflowDef creates a new workflow def', async () => {
      await service.registerWorkflowDef(sampleWorkflowDef);
      const got = await service.getWorkflowDef('test_workflow', 1);
      expect(got).toBeDefined();
      expect(got!.name).toBe('test_workflow');
    });

    it('registerWorkflowDef throws if workflow def already exists', async () => {
      await expect(service.registerWorkflowDef(sampleWorkflowDef)).rejects.toThrow(
        'already exists',
      );
    });

    it('getWorkflowDef returns workflow def without version', async () => {
      const got = await service.getWorkflowDef('test_workflow');
      expect(got).toBeDefined();
    });

    it('getWorkflowDefs returns all workflow defs', async () => {
      const defs = await service.getWorkflowDefs();
      expect(defs.length).toBeGreaterThanOrEqual(1);
    });

    it('removeWorkflowDef removes a workflow def', async () => {
      await service.removeWorkflowDef('test_workflow', 1);
      const got = await service.getWorkflowDef('test_workflow', 1);
      expect(got).toBeUndefined();
    });
  });
});
