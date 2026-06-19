import { afterEach, beforeEach, describe, expect, it } from 'vitest';
export function runQueueDAOContractTests(daoProvider, cleanup) {
    describe('QueueDAO contract', () => {
        let dao;
        beforeEach(async () => {
            dao = await daoProvider();
        });
        afterEach(async () => {
            await cleanup();
        });
        it('pushes and pops messages', async () => {
            await dao.push('test_q', 'msg1', 0, 0);
            await expect(dao.pop('test_q', 1, 1000)).resolves.toEqual(['msg1']);
        });
        it('does not pop a message before its offset expires', async () => {
            await dao.push('test_q_offset', 'msg2', 5, 0);
            await expect(dao.pop('test_q_offset', 1, 10)).resolves.toEqual([]);
        });
    });
}
//# sourceMappingURL=QueueDAO.contract.js.map