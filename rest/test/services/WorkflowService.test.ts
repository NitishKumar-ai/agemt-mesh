import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import DatabaseDriver from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from '@agentmesh/common-persistence';
import { InitialSchemaMigration } from '@agentmesh/common-persistence';
import {
  SqliteExecutionDAO,
  SqliteMetadataDAO,
  SqliteQueueDAO,
} from '@agentmesh/sqlite-persistence';
import { WorkflowService } from '../../src/services/WorkflowService.js';
import type { WorkflowDef } from '@agentmesh/common';
import type { WorkflowExecutor } from '@agentmesh/core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createDb(): any {
  return new Kysely<Database>({
    dialect: new SqliteDialect({ database: new DatabaseDriver(':memory:') }),
  });
}

describe('WorkflowService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let service: WorkflowService;
  let metadataDAO: any;

  beforeAll(async () => {
    db = createDb();
    await InitialSchemaMigration.up(db);
    const executionDAO = new SqliteExecutionDAO(db);
    metadataDAO = new SqliteMetadataDAO(db);
    const queueDAO = new SqliteQueueDAO(db);
    service = new WorkflowService(executionDAO, metadataDAO, queueDAO);
  });

  afterAll(async () => {
    await db.destroy();
  });

  const sampleWorkflowDef: WorkflowDef = {
    name: 'test_wf',
    version: 1,
    ownerEmail: 'test@example.com',
    tasks: [
      {
        name: 'task1',
        taskReferenceName: 't1',
        type: 'SIMPLE',
      },
    ],
  };

  beforeEach(async () => {
    await db.deleteFrom('meta_workflow_def').execute();
    await db.deleteFrom('workflow').execute();
    await db.deleteFrom('task').execute();
    await db.deleteFrom('queue_message').execute();
    await db.deleteFrom('queue').execute();
    await db.deleteFrom('workflow_to_task').execute();
    await db.deleteFrom('workflow_pending').execute();
    await db.deleteFrom('workflow_def_to_workflow').execute();
    await db.deleteFrom('task_in_progress').execute();
    await db.deleteFrom('task_scheduled').execute();
  });

  it('startWorkflow creates and returns a workflow ID', async () => {
    await metadataDAO.createWorkflowDef(sampleWorkflowDef);
    const wfId = await service.startWorkflow({ name: 'test_wf', version: 1 });
    expect(wfId).toBeDefined();
    expect(typeof wfId).toBe('string');
  });

  it('startWorkflow throws if workflow def not found', async () => {
    await expect(service.startWorkflow({ name: 'nonexistent', version: 1 })).rejects.toThrow(
      'not found',
    );
  });

  it('getWorkflow returns a started workflow', async () => {
    await metadataDAO.createWorkflowDef(sampleWorkflowDef);
    const wfId = await service.startWorkflow({ name: 'test_wf', version: 1 });
    const wf = await service.getWorkflow(wfId);
    expect(wf).toBeDefined();
    expect(wf!.workflowId).toBe(wfId);
  });

  it('getWorkflow returns undefined for non-existent workflow', async () => {
    const wf = await service.getWorkflow('nonexistent');
    expect(wf).toBeUndefined();
  });

  it('getRunningWorkflowIds returns running workflow IDs', async () => {
    await metadataDAO.createWorkflowDef(sampleWorkflowDef);
    const wfId1 = await service.startWorkflow({ name: 'test_wf', version: 1 });
    const wfId2 = await service.startWorkflow({ name: 'test_wf', version: 1 });
    const ids = await service.getRunningWorkflowIds('test_wf', 1);
    expect(ids).toContain(wfId1);
    expect(ids).toContain(wfId2);
  });

  it('terminateWorkflow sets status to TERMINATED', async () => {
    await metadataDAO.createWorkflowDef(sampleWorkflowDef);
    const wfId = await service.startWorkflow({ name: 'test_wf', version: 1 });
    await service.terminateWorkflow(wfId, 'test reason');
    const wf = await service.getWorkflow(wfId);
    expect(wf!.status).toBe('TERMINATED');
  });

  it('terminateWorkflow throws for non-existent workflow', async () => {
    await expect(service.terminateWorkflow('nonexistent')).rejects.toThrow('not found');
  });

  it('pauseWorkflow sets status to PAUSED', async () => {
    await metadataDAO.createWorkflowDef(sampleWorkflowDef);
    const wfId = await service.startWorkflow({ name: 'test_wf', version: 1 });
    await service.pauseWorkflow(wfId);
    const wf = await service.getWorkflow(wfId);
    expect(wf!.status).toBe('PAUSED');
  });

  it('resumeWorkflow sets status back to RUNNING', async () => {
    await metadataDAO.createWorkflowDef(sampleWorkflowDef);
    const wfId = await service.startWorkflow({ name: 'test_wf', version: 1 });
    await service.pauseWorkflow(wfId);
    await service.resumeWorkflow(wfId);
    const wf = await service.getWorkflow(wfId);
    expect(wf!.status).toBe('RUNNING');
  });

  it('rerunWorkflow creates a new workflow', async () => {
    await metadataDAO.createWorkflowDef(sampleWorkflowDef);
    const wfId = await service.startWorkflow({ name: 'test_wf', version: 1 });
    const newId = await service.rerunWorkflow(wfId, {});
    expect(newId).toBeDefined();
    expect(newId).not.toBe(wfId);
  });

  it('restartWorkflow resets workflow status', async () => {
    await metadataDAO.createWorkflowDef(sampleWorkflowDef);
    const wfId = await service.startWorkflow({ name: 'test_wf', version: 1 });
    await service.terminateWorkflow(wfId);
    await service.restartWorkflow(wfId);
    const wf = await service.getWorkflow(wfId);
    expect(wf!.status).toBe('RUNNING');
  });

  it('retryWorkflow resets workflow status', async () => {
    await metadataDAO.createWorkflowDef(sampleWorkflowDef);
    const wfId = await service.startWorkflow({ name: 'test_wf', version: 1 });
    await service.terminateWorkflow(wfId);
    await service.retryWorkflow(wfId);
    const wf = await service.getWorkflow(wfId);
    expect(wf!.status).toBe('RUNNING');
  });

  it('resetWorkflow pushes to decider queue', async () => {
    await metadataDAO.createWorkflowDef(sampleWorkflowDef);
    const wfId = await service.startWorkflow({ name: 'test_wf', version: 1 });
    await expect(service.resetWorkflow(wfId)).resolves.toBeUndefined();
  });

  it('decideWorkflow pushes to decider queue', async () => {
    await metadataDAO.createWorkflowDef(sampleWorkflowDef);
    const wfId = await service.startWorkflow({ name: 'test_wf', version: 1 });
    await expect(service.decideWorkflow(wfId)).resolves.toBeUndefined();
  });

  it('getWorkflowTasks returns empty for workflow without tasks', async () => {
    await metadataDAO.createWorkflowDef(sampleWorkflowDef);
    const wfId = await service.startWorkflow({ name: 'test_wf', version: 1 });
    const result = await service.getWorkflowTasks(wfId);
    expect(result.totalHits).toBe(0);
  });

  it('getWorkflowTasks throws for non-existent workflow', async () => {
    await expect(service.getWorkflowTasks('nonexistent')).rejects.toThrow('not found');
  });

  it('searchWorkflows returns empty result', async () => {
    const result = await service.searchWorkflows();
    expect(result.totalHits).toBe(0);
    expect(result.results).toEqual([]);
  });

  it('terminateRemove terminates and removes', async () => {
    await metadataDAO.createWorkflowDef(sampleWorkflowDef);
    const wfId = await service.startWorkflow({ name: 'test_wf', version: 1 });
    await service.terminateRemove(wfId);
    const wf = await service.getWorkflow(wfId);
    expect(wf).toBeUndefined();
  });
});

describe('WorkflowService with a wired WorkflowExecutor', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let service: WorkflowService;
  let executor: WorkflowExecutor;

  beforeAll(async () => {
    db = createDb();
    await InitialSchemaMigration.up(db);
    const executionDAO = new SqliteExecutionDAO(db);
    const metadataDAO = new SqliteMetadataDAO(db);
    const queueDAO = new SqliteQueueDAO(db);
    executor = {
      pauseWorkflow: vi.fn(),
      resumeWorkflow: vi.fn(),
      terminateWorkflow: vi.fn(),
    } as unknown as WorkflowExecutor;
    service = new WorkflowService(executionDAO, metadataDAO, queueDAO, executor);
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('pauseWorkflow delegates to the executor instead of writing the DAO directly', async () => {
    await service.pauseWorkflow('wf-1');
    expect(executor.pauseWorkflow).toHaveBeenCalledWith('wf-1');
  });

  it('resumeWorkflow delegates to the executor instead of writing the DAO directly', async () => {
    await service.resumeWorkflow('wf-1');
    expect(executor.resumeWorkflow).toHaveBeenCalledWith('wf-1');
  });

  it('terminateWorkflow delegates to the executor instead of writing the DAO directly', async () => {
    await service.terminateWorkflow('wf-1', 'because');
    expect(executor.terminateWorkflow).toHaveBeenCalledWith('wf-1', 'because');
  });

  it('terminateWorkflow defaults the reason when delegating to the executor', async () => {
    await service.terminateWorkflow('wf-1');
    expect(executor.terminateWorkflow).toHaveBeenCalledWith('wf-1', 'terminated via API');
  });

  it('propagates an invalid-transition error thrown by the executor instead of swallowing it', async () => {
    (executor.resumeWorkflow as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('The workflow wf-1 is not PAUSED so cannot resume. Current status is RUNNING');
    });
    await expect(service.resumeWorkflow('wf-1')).rejects.toThrow('cannot resume');
  });
});
