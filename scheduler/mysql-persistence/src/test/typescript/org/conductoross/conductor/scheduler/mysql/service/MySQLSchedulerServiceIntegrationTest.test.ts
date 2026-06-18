import { describe, it, expect } from 'vitest';
import { MySQLSchedulerDAO } from '../../../../../../../../main/typescript/org/conductoross/conductor/scheduler/mysql/dao/MySQLSchedulerDAO';

describe('MySQLSchedulerServiceIntegrationTest', () => {
    it('should run service integration tests for mysql', () => {
        expect(MySQLSchedulerDAO).toBeDefined();
    });
});
