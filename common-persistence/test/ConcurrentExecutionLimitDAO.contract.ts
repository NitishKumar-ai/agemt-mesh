import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import type { ConcurrentExecutionLimitDAO } from '../src/ConcurrentExecutionLimitDAO.js';
import type { TaskModel } from '@conductor/common';

export function runConcurrentExecutionLimitDAOContractTests(
  daoProvider: () => Promise<ConcurrentExecutionLimitDAO>,
  seedTaskInProgress: (taskDefName: string, taskId: string, workflowId: string, inProgress: boolean) => Promise<void>,
  cleanup: () => Promise<void>,
): void {
  describe('ConcurrentExecutionLimitDAO contract', () => {
    let dao: ConcurrentExecutionLimitDAO;

    beforeEach(async () => {
      dao = await daoProvider();
    });

    afterEach(async () => {
      await cleanup();
    });

    it('checks concurrent execution limits based on FIFO arrival order', async () => {
      const task1: TaskModel = {
        taskId: 'task_1',
        taskDefName: 'agent_mesh_task_def_limit',
        workflowInstanceId: 'wf_1',
        taskDefinition: {
          name: 'agent_mesh_task_def_limit',
          concurrentExecLimit: 2,
        },
      };

      const task2: TaskModel = {
        taskId: 'task_2',
        taskDefName: 'agent_mesh_task_def_limit',
        workflowInstanceId: 'wf_2',
        taskDefinition: {
          name: 'agent_mesh_task_def_limit',
          concurrentExecLimit: 2,
        },
      };

      const task3: TaskModel = {
        taskId: 'task_3',
        taskDefName: 'agent_mesh_task_def_limit',
        workflowInstanceId: 'wf_3',
        taskDefinition: {
          name: 'agent_mesh_task_def_limit',
          concurrentExecLimit: 2,
        },
      };

      // 1. Seed task1. Limit is 2. current = 0. Should not exceed.
      await seedTaskInProgress('agent_mesh_task_def_limit', 'task_1', 'wf_1', false);
      await expect(dao.exceedsLimit(task1)).resolves.toBe(false);

      // 2. Seed task2. current = 0. Should not exceed.
      await seedTaskInProgress('agent_mesh_task_def_limit', 'task_2', 'wf_2', false);
      await expect(dao.exceedsLimit(task2)).resolves.toBe(false);

      // 3. Seed task3. current = 0. But it is 3rd in queue (limit is 2). Should exceed.
      await seedTaskInProgress('agent_mesh_task_def_limit', 'task_3', 'wf_3', false);
      await expect(dao.exceedsLimit(task3)).resolves.toBe(true);

      // 4. Mark task1 as in progress. current = 1. task3 is still 3rd in queue. Should exceed.
      await cleanup();
      await seedTaskInProgress('agent_mesh_task_def_limit', 'task_1', 'wf_1', true);
      await seedTaskInProgress('agent_mesh_task_def_limit', 'task_2', 'wf_2', false);
      await seedTaskInProgress('agent_mesh_task_def_limit', 'task_3', 'wf_3', false);
      await expect(dao.exceedsLimit(task3)).resolves.toBe(true);

      // 5. Complete/Remove task1 from progress. Now queue has task2 and task3. current = 0. Should not exceed.
      await cleanup();
      await seedTaskInProgress('agent_mesh_task_def_limit', 'task_2', 'wf_2', false);
      await seedTaskInProgress('agent_mesh_task_def_limit', 'task_3', 'wf_3', false);
      await expect(dao.exceedsLimit(task3)).resolves.toBe(false);
    });
  });
}
