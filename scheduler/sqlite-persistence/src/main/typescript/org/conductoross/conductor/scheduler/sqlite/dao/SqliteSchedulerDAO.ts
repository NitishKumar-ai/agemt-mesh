import { SearchResult } from '../../../../../../../../../../mock';
import { NonTransientException } from '../../../../../../../../../../mock';
import { SchedulerDAO } from '../../../../../../../../../../mock';
import { WorkflowScheduleExecutionModel, WorkflowScheduleModel } from '../../../../../../../../../../mock';

export class SqliteSchedulerDAO implements SchedulerDAO {
    private readonly db: any;

    constructor(db: any) {
        this.db = db;
    }

    async updateSchedule(schedule: WorkflowScheduleModel): Promise<void> {
        this.db.prepare(
            "INSERT OR REPLACE INTO scheduler (scheduler_name, workflow_name, json_data, next_run_time) VALUES (?, ?, ?, ?)"
        ).run(
            schedule.name,
            schedule.startWorkflowRequest ? schedule.startWorkflowRequest.name : null,
            JSON.stringify(schedule),
            schedule.nextRunTime
        );
        this.db.prepare("DELETE FROM scheduler_next_run WHERE key = ?").run(schedule.name);
    }

    async findScheduleByName(name: string): Promise<WorkflowScheduleModel | null> {
        const row = this.db.prepare("SELECT json_data FROM scheduler WHERE scheduler_name = ?").get(name);
        return row ? JSON.parse(row.json_data) : null;
    }

    async getAllSchedules(): Promise<WorkflowScheduleModel[]> {
        const rows = this.db.prepare("SELECT json_data FROM scheduler").all();
        return rows.map((row: any) => JSON.parse(row.json_data));
    }

    async findAllSchedules(workflowName: string): Promise<WorkflowScheduleModel[]> {
        const rows = this.db.prepare("SELECT json_data FROM scheduler WHERE workflow_name = ?").all(workflowName);
        return rows.map((row: any) => JSON.parse(row.json_data));
    }

    async findAllByNames(names: Set<string>): Promise<Map<string, WorkflowScheduleModel>> {
        const result = new Map<string, WorkflowScheduleModel>();
        if (!names || names.size === 0) {
            return result;
        }
        const placeholders = Array.from(names).map(() => "?").join(", ");
        const rows = this.db.prepare(`SELECT json_data FROM scheduler WHERE scheduler_name IN (${placeholders})`).all(...names);
        
        for (const row of rows) {
            const schedule = JSON.parse(row.json_data) as WorkflowScheduleModel;
            result.set(schedule.name, schedule);
        }
        return result;
    }

    async deleteWorkflowSchedule(name: string): Promise<void> {
        this.db.prepare("DELETE FROM scheduler_execution WHERE schedule_name = ?").run(name);
        this.db.prepare("DELETE FROM scheduler_next_run WHERE key = ?").run(name);
        this.db.prepare("DELETE FROM scheduler WHERE scheduler_name = ?").run(name);
    }

    async saveExecutionRecord(execution: WorkflowScheduleExecutionModel): Promise<void> {
        this.db.prepare(
            "INSERT OR REPLACE INTO scheduler_execution (execution_id, schedule_name, state, json_data) VALUES (?, ?, ?, ?)"
        ).run(
            execution.executionId,
            execution.scheduleName,
            execution.state ? execution.state : null,
            JSON.stringify(execution)
        );
    }

    async readExecutionRecord(executionId: string): Promise<WorkflowScheduleExecutionModel | null> {
        const row = this.db.prepare("SELECT json_data FROM scheduler_execution WHERE execution_id = ?").get(executionId);
        return row ? JSON.parse(row.json_data) : null;
    }

    async removeExecutionRecord(executionId: string): Promise<void> {
        this.db.prepare("DELETE FROM scheduler_execution WHERE execution_id = ?").run(executionId);
    }

    async getPendingExecutionRecordIds(): Promise<string[]> {
        const rows = this.db.prepare("SELECT execution_id FROM scheduler_execution WHERE state = 'POLLED'").all();
        return rows.map((row: any) => row.execution_id);
    }

    async getNextRunTimeInEpoch(scheduleName: string): Promise<number> {
        const row = this.db.prepare("SELECT epoch_millis FROM scheduler_next_run WHERE key = ?").get(scheduleName);
        if (!row || row.epoch_millis == null) {
            return -1;
        }
        return row.epoch_millis;
    }

    async setNextRunTimeInEpoch(scheduleName: string, epochMillis: number): Promise<void> {
        this.db.prepare(
            "INSERT OR REPLACE INTO scheduler_next_run (key, epoch_millis) VALUES (?, ?)"
        ).run(scheduleName, epochMillis);
    }

    async searchSchedules(
        workflowName: string,
        scheduleName: string,
        paused: boolean,
        freeText: string,
        start: number,
        size: number,
        sortOptions: string[]
    ): Promise<SearchResult<WorkflowScheduleModel>> {
        let sql = "SELECT json_data FROM scheduler WHERE 1=1";
        let countSql = "SELECT COUNT(*) as count FROM scheduler WHERE 1=1";
        const params: any[] = [];
        const countParams: any[] = [];

        if (workflowName) {
            sql += " AND workflow_name = ?";
            countSql += " AND workflow_name = ?";
            params.push(workflowName);
            countParams.push(workflowName);
        }
        if (scheduleName) {
            sql += " AND scheduler_name LIKE ?";
            countSql += " AND scheduler_name LIKE ?";
            params.push(`%${scheduleName}%`);
            countParams.push(`%${scheduleName}%`);
        }
        if (paused !== null && paused !== undefined) {
            sql += " AND json_extract(json_data, '$.paused') = ?";
            countSql += " AND json_extract(json_data, '$.paused') = ?";
            params.push(paused ? 1 : 0);
            countParams.push(paused ? 1 : 0);
        }

        const countRow = this.db.prepare(countSql).get(...countParams);
        const totalHits = countRow ? countRow.count : 0;

        sql += " ORDER BY scheduler_name LIMIT ? OFFSET ?";
        params.push(size, start);

        const rows = this.db.prepare(sql).all(...params);
        const results = rows.map((row: any) => JSON.parse(row.json_data));

        return { totalHits, results };
    }
}
