import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { SqliteSchedulerArchivalDAO } from '../../../../../../../../main/typescript/org/conductoross/conductor/scheduler/sqlite/dao/SqliteSchedulerArchivalDAO';
import { WorkflowScheduleExecutionModel } from '../../../../../../../../../../mock';

/**
 * Runs the full contract suite against an in-memory SQLite database.
 */
describe('SqliteSchedulerArchivalDAOTest', () => {
    let db: any;
    let schedulerArchivalDAO: SqliteSchedulerArchivalDAO;

    beforeAll(() => {
        // Equivalent to spring.datasource.url=jdbc:sqlite::memory:
        db = new Database(':memory:');
        
        // Mock flyway migration for scheduler tables
        db.exec(`
            CREATE TABLE workflow_scheduled_executions (
                execution_id TEXT PRIMARY KEY,
                schedule_name TEXT,
                workflow_name TEXT,
                workflow_id TEXT,
                reason TEXT,
                stack_trace TEXT,
                state TEXT,
                scheduled_time INTEGER,
                execution_time INTEGER,
                start_workflow_request TEXT
            );
        `);
        
        schedulerArchivalDAO = new SqliteSchedulerArchivalDAO(db);
    });

    afterAll(() => {
        if (db) {
            db.close();
        }
    });

    beforeEach(() => {
        db.exec("DELETE FROM workflow_scheduled_executions");
    });

    it('should save and read execution record', async () => {
        const executionModel = new WorkflowScheduleExecutionModel();
        executionModel.executionId = 'exec-1';
        executionModel.scheduleName = 'schedule-1';
        executionModel.workflowName = 'test-workflow';
        executionModel.scheduledTime = 1000;
        
        await schedulerArchivalDAO.saveExecutionRecord(executionModel);
        
        const retrieved = await schedulerArchivalDAO.getExecutionById('exec-1');
        expect(retrieved).not.toBeNull();
        expect(retrieved?.executionId).toBe('exec-1');
        expect(retrieved?.scheduleName).toBe('schedule-1');
        expect(retrieved?.workflowName).toBe('test-workflow');
    });

    it('should clean up old records', async () => {
        for (let i = 0; i < 5; i++) {
            const executionModel = new WorkflowScheduleExecutionModel();
            executionModel.executionId = `exec-${i}`;
            executionModel.scheduleName = 'schedule-cleanup';
            executionModel.scheduledTime = 1000 + i;
            await schedulerArchivalDAO.saveExecutionRecord(executionModel);
        }

        await schedulerArchivalDAO.cleanupOldRecords(2, 3);
        
        const result = await schedulerArchivalDAO.searchScheduledExecutions("schedule_name=schedule-cleanup", "", 0, 10, []);
        expect(result.results.length).toBe(2);
        // Ensure the remaining ones are the most recent (exec-3 and exec-4)
        expect(result.results).toContain('exec-4');
        expect(result.results).toContain('exec-3');
    });
});
