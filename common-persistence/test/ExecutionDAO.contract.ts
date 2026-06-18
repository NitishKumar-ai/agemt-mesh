import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import type { ExecutionDAO } from '../src/ExecutionDAO.js';
import type { TaskModel, WorkflowModel, EventExecution, TaskExecLog } from '@conductor/common';

export function runExecutionDAOContractTests(
  daoProvider: () => Promise<ExecutionDAO>,
  cleanup: () => Promise<void>,
): void {
  describe('ExecutionDAO contract', () => {
    let dao: ExecutionDAO;

    beforeEach(async () => {
      dao = await daoProvider();
    });

    afterEach(async () => {
      await cleanup();
    });

    it('creates, gets, updates, and deletes workflows', async () => {
      const workflow: WorkflowModel = {
        workflowId: 'agent_mesh_wf_id_1',
        workflowName: 'agent_mesh_wf_type_1',
        workflowType: 'agent_mesh_wf_type_1',
        version: 1,
        status: 'RUNNING',
        input: { key: 'val' },
        createTime: Date.now(),
        tasks: [],
      };

      // Create workflow
      const createdId = await dao.createWorkflow(workflow);
      expect(createdId).toBe('agent_mesh_wf_id_1');

      // Get workflow
      const fetched = await dao.getWorkflow('agent_mesh_wf_id_1', true);
      expect(fetched).toBeDefined();
      expect(fetched!.workflowId).toBe('agent_mesh_wf_id_1');
      expect(fetched!.status).toBe('RUNNING');

      // Update workflow
      workflow.status = 'COMPLETED';
      workflow.output = { result: 'done' };
      const updatedId = await dao.updateWorkflow(workflow);
      expect(updatedId).toBe('agent_mesh_wf_id_1');

      const fetchedUpdated = await dao.getWorkflow('agent_mesh_wf_id_1', false);
      expect(fetchedUpdated!.status).toBe('COMPLETED');
      expect(fetchedUpdated!.output).toEqual({ result: 'done' });

      // Pending workflow count
      const runningCount = await dao.getPendingWorkflowCount('agent_mesh_wf_type_1');
      expect(runningCount).toBeDefined();

      const runningWfIds = await dao.getRunningWorkflowIds('agent_mesh_wf_type_1', 1);
      expect(runningWfIds).toBeDefined();

      // Remove workflow
      const deleted = await dao.removeWorkflow('agent_mesh_wf_id_1');
      expect(deleted).toBe(true);

      const afterDelete = await dao.getWorkflow('agent_mesh_wf_id_1');
      expect(afterDelete).toBeUndefined();
    });

    it('creates, gets, updates, and deletes tasks', async () => {
      // First need a workflow because task tables refer to workflows/foreign key or structures in some engines
      const workflow: WorkflowModel = {
        workflowId: 'agent_mesh_wf_id_task',
        workflowName: 'agent_mesh_wf_type_task',
        workflowType: 'agent_mesh_wf_type_task',
        version: 1,
        status: 'RUNNING',
        input: {},
        createTime: Date.now(),
        tasks: [],
      };
      await dao.createWorkflow(workflow);

      const task: TaskModel = {
        taskId: 'agent_mesh_task_id_1',
        taskDefName: 'agent_mesh_task_def_1',
        referenceTaskName: 'agent_mesh_task_ref_1',
        workflowInstanceId: 'agent_mesh_wf_id_task',
        status: 'IN_PROGRESS',
        inputData: { p1: 'abc' },
        createTime: Date.now(),
      };

      // Create tasks
      const createdTasks = await dao.createTasks([task]);
      expect(createdTasks.length).toBe(1);
      expect(createdTasks[0].taskId).toBe('agent_mesh_task_id_1');

      // Get task
      const fetched = await dao.getTask('agent_mesh_task_id_1');
      expect(fetched).toBeDefined();
      expect(fetched!.taskId).toBe('agent_mesh_task_id_1');
      expect(fetched!.status).toBe('IN_PROGRESS');

      // Get tasks by IDs
      const fetchedList = await dao.getTasksByIds(['agent_mesh_task_id_1']);
      expect(fetchedList.length).toBe(1);

      // Update task
      task.status = 'COMPLETED';
      task.outputData = { out: 123 };
      await dao.updateTask(task);

      const fetchedUpdated = await dao.getTask('agent_mesh_task_id_1');
      expect(fetchedUpdated!.status).toBe('COMPLETED');

      // Get pending tasks by workflow
      const pendingTasks = await dao.getPendingTasksByWorkflow('agent_mesh_task_def_1', 'agent_mesh_wf_id_task');
      expect(pendingTasks).toBeDefined();

      // Get tasks for workflow
      const wfTasks = await dao.getTasksForWorkflow('agent_mesh_wf_id_task');
      expect(wfTasks.some(t => t.taskId === 'agent_mesh_task_id_1')).toBe(true);

      // Remove task
      const removed = await dao.removeTask('agent_mesh_task_id_1');
      expect(removed).toBe(true);

      const afterDelete = await dao.getTask('agent_mesh_task_id_1');
      expect(afterDelete).toBeUndefined();
    });

    it('adds, updates, and deletes event executions', async () => {
      const eventExec: EventExecution = {
        id: 'agent_mesh_ee_1',
        name: 'agent_mesh_eh_1',
        event: 'agent_mesh_event_1',
        messageId: 'agent_mesh_msg_1',
        status: 'IN_PROGRESS',
        created: Date.now(),
      };

      // Add
      const added = await dao.addEventExecution(eventExec);
      expect(added).toBe(true);

      // Update
      eventExec.status = 'COMPLETED';
      await dao.updateEventExecution(eventExec);

      // Remove
      await dao.removeEventExecution(eventExec);
    });

    it('adds and gets task logs', async () => {
      const log1: TaskExecLog = {
        log: 'agent_mesh_log_msg_1',
        createdTime: Date.now(),
      };
      const log2: TaskExecLog = {
        log: 'agent_mesh_log_msg_2',
        createdTime: Date.now() + 10,
      };

      await dao.addTaskLog('agent_mesh_task_id_log', log1);
      await dao.addTaskLog('agent_mesh_task_id_log', log2);

      const logs = await dao.getTaskLogs('agent_mesh_task_id_log');
      expect(logs.length).toBe(2);
      expect(logs[0].log).toBe('agent_mesh_log_msg_1');
      expect(logs[1].log).toBe('agent_mesh_log_msg_2');
    });

    it('removes workflow with expiry', async () => {
      const workflow: WorkflowModel = {
        workflowId: 'agent_mesh_wf_expiry',
        workflowName: 'agent_mesh_wf_type_expiry',
        workflowType: 'agent_mesh_wf_type_expiry',
        version: 1,
        status: 'RUNNING',
        input: {},
        createTime: Date.now(),
        tasks: [],
      };

      await dao.createWorkflow(workflow);
      const ok = await dao.removeWorkflowWithExpiry('agent_mesh_wf_expiry', 1);
      expect(ok).toBe(true);

      // Wait 1.5s for expiry to fire
      await new Promise(resolve => setTimeout(resolve, 1500));

      const fetched = await dao.getWorkflow('agent_mesh_wf_expiry');
      expect(fetched).toBeUndefined();
    });
  });
}
