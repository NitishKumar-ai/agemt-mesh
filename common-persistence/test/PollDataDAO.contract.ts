import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import type { PollDataDAO } from '../src/PollDataDAO.js';

export function runPollDataDAOContractTests(
  daoProvider: () => Promise<PollDataDAO>,
  cleanup: () => Promise<void>,
): void {
  describe('PollDataDAO contract', () => {
    let dao: PollDataDAO;

    beforeEach(async () => {
      dao = await daoProvider();
    });

    afterEach(async () => {
      await cleanup();
    });

    it('updates and retrieves poll data', async () => {
      // Update
      await dao.updateLastPollData('agent_mesh_task_poll', 'domain_a', 'worker_1');
      await dao.updateLastPollData('agent_mesh_task_poll', 'domain_b', 'worker_2');

      // Get specific
      const pollA = await dao.getPollData('agent_mesh_task_poll', 'domain_a');
      expect(pollA).toBeDefined();
      expect(pollA!.workerId).toBe('worker_1');
      expect(pollA!.queueName).toBe('agent_mesh_task_poll');
      expect(pollA!.domain).toBe('domain_a');

      // Get for task
      const pollsForTask = await dao.getPollDataForTask('agent_mesh_task_poll');
      expect(pollsForTask.length).toBe(2);
      expect(pollsForTask.map(p => p.domain)).toContain('domain_a');
      expect(pollsForTask.map(p => p.domain)).toContain('domain_b');

      // Get all
      const allPolls = await dao.getAllPollData();
      expect(allPolls.length).toBeGreaterThanOrEqual(2);
    });
  });
}
