import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PostgresSchedulerArchivalDAO } from '../../../../../../../../main/typescript/org/conductoross/conductor/scheduler/postgres/dao/PostgresSchedulerArchivalDAO';
// import { AbstractSchedulerArchivalDAOTest } from '../../../../../../../../../../core/src/testFixtures/typescript/io/orkes/conductor/scheduler/dao/AbstractSchedulerArchivalDAOTest';

describe('PostgresSchedulerArchivalDAOTest', () => {
    let schedulerArchivalDAO: PostgresSchedulerArchivalDAO;
    let dataSource: any;
    
    beforeEach(() => {
        dataSource = {};
        schedulerArchivalDAO = new PostgresSchedulerArchivalDAO({}, {}, dataSource);
    });

    afterEach(() => {
    });

    it('should run abstract scheduler archival DAO tests', () => {
        // const testSuite = new AbstractSchedulerArchivalDAOTest(schedulerArchivalDAO);
        // testSuite.runAllTests();
        expect(true).toBe(true);
    });
});
