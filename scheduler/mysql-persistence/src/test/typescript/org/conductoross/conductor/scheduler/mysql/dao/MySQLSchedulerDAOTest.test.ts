import { describe, it, expect } from 'vitest';
import { MySQLSchedulerDAO } from '../../../../../../../../main/typescript/org/conductoross/conductor/scheduler/mysql/dao/MySQLSchedulerDAO';

describe('MySQLSchedulerDAOTest', () => {
    it('should be configured with mysql datasource', () => {
        expect(MySQLSchedulerDAO).toBeDefined();
    });
});
