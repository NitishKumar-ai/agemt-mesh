import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import type { RateLimitingDAO } from '../src/RateLimitingDAO.js';
import type { TaskModel, TaskDef } from '@conductor/common';

export function runRateLimitingDAOContractTests(
  daoProvider: () => Promise<RateLimitingDAO>,
  cleanup: () => Promise<void>,
): void {
  describe('RateLimitingDAO contract', () => {
    let dao: RateLimitingDAO;

    beforeEach(async () => {
      dao = await daoProvider();
    });

    afterEach(async () => {
      await cleanup();
    });

    it('implements exceedsRateLimitPerFrequency as no-op/returns false', async () => {
      const task: TaskModel = {
        taskId: 'agent_mesh_task_rl_1',
        taskDefName: 'agent_mesh_task_def_rl',
      };
      const taskDef: TaskDef = {
        name: 'agent_mesh_task_def_rl',
      };

      await expect(dao.exceedsRateLimitPerFrequency(task, taskDef)).resolves.toBe(false);
    });
  });
}
