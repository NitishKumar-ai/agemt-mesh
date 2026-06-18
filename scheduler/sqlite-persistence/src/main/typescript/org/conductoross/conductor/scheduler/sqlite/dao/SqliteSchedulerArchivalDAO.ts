import { SearchResult } from '../../../../../../../../../../mock';
import { NonTransientException } from '../../../../../../../../../../mock';
import { SchedulerArchivalDAO, SchedulerSearchQuery } from '../../../../../../../../../../mock';
import { WorkflowScheduleExecutionModel } from '../../../../../../../../../../mock';

export class SqliteSchedulerArchivalDAO implements SchedulerArchivalDAO {
    private readonly db: any;

    constructor(db: any) {
        this.db = db;
    }

    async saveExecutionRecord(executionModel: WorkflowScheduleExecutionModel): Promise<void> {
        const sql = `
            INSERT OR REPLACE INTO workflow_scheduled_executions 
            (execution_id, schedule_name, workflow_name, workflow_id, reason, 
            stack_trace, state, scheduled_time, execution_time, start_workflow_request) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        this.db.prepare(sql).run(
            executionModel.executionId,
            executionModel.scheduleName,
            executionModel.workflowName,
            executionModel.workflowId,
            executionModel.reason,
            executionModel.stackTrace,
            executionModel.state ? executionModel.state : null,
            executionModel.scheduledTime,
            executionModel.executionTime,
            executionModel.startWorkflowRequest ? JSON.stringify(executionModel.startWorkflowRequest) : null
        );
    }

    async searchScheduledExecutions(
        query: string,
        freeText: string,
        start: number,
        count: number,
        sort: string[]
    ): Promise<SearchResult<string>> {
        let sql = "SELECT execution_id FROM workflow_scheduled_executions WHERE 1=1";
        let countSql = "SELECT COUNT(*) as cnt FROM workflow_scheduled_executions WHERE 1=1";
        const params: any[] = [];
        const countParams: any[] = [];

        // Mocking the behavior of Java's SchedulerSearchQuery
        const parsed = SchedulerSearchQuery.parse(query);
        
        if (parsed.hasScheduleNames()) {
            const placeholders = Array(parsed.scheduleNames.length).fill('?').join(',');
            sql += ` AND schedule_name IN (${placeholders})`;
            countSql += ` AND schedule_name IN (${placeholders})`;
            params.push(...parsed.scheduleNames);
            countParams.push(...parsed.scheduleNames);
        }
        if (parsed.hasStates()) {
            const placeholders = Array(parsed.states.length).fill('?').join(',');
            sql += ` AND state IN (${placeholders})`;
            countSql += ` AND state IN (${placeholders})`;
            params.push(...parsed.states);
            countParams.push(...parsed.states);
        }
        if (parsed.scheduledTimeAfter !== null && parsed.scheduledTimeAfter !== undefined) {
            sql += " AND scheduled_time > ?";
            countSql += " AND scheduled_time > ?";
            params.push(parsed.scheduledTimeAfter);
            countParams.push(parsed.scheduledTimeAfter);
        }
        if (parsed.scheduledTimeBefore !== null && parsed.scheduledTimeBefore !== undefined) {
            sql += " AND scheduled_time < ?";
            countSql += " AND scheduled_time < ?";
            params.push(parsed.scheduledTimeBefore);
            countParams.push(parsed.scheduledTimeBefore);
        }
        if (parsed.hasWorkflowName()) {
            sql += " AND workflow_name LIKE ?";
            countSql += " AND workflow_name LIKE ?";
            const like = `%${parsed.workflowName}%`;
            params.push(like);
            countParams.push(like);
        }
        if (parsed.hasExecutionId()) {
            sql += " AND execution_id = ?";
            countSql += " AND execution_id = ?";
            params.push(parsed.executionId);
            countParams.push(parsed.executionId);
        }

        const countRow = this.db.prepare(countSql).get(...countParams);
        const totalHits = countRow ? countRow.cnt : 0;

        const orderBy = SqliteSchedulerArchivalDAO.buildOrderByClause(sort);
        sql += `${orderBy} LIMIT ? OFFSET ?`;
        params.push(count, start);

        const rows = this.db.prepare(sql).all(...params);
        const executionIds = rows.map((row: any) => row.execution_id);

        return { totalHits, results: executionIds };
    }

    private static buildOrderByClause(sortOptions: string[]): string {
        if (!sortOptions || sortOptions.length === 0) {
            return " ORDER BY scheduled_time DESC";
        }
        const orderClauses: string[] = [];
        for (const sortOption of sortOptions) {
            const parts = sortOption.split(":");
            const field = parts[0].trim();
            const direction = parts.length > 1 && parts[1].trim().toUpperCase() === "ASC" ? "ASC" : "DESC";
            const column = SchedulerSearchQuery.resolveColumnName(field);
            orderClauses.push(`${column} ${direction}`);
        }
        return " ORDER BY " + orderClauses.join(", ");
    }

    async getExecutionsByIds(executionIds: Set<string>): Promise<Map<string, WorkflowScheduleExecutionModel>> {
        const resultMap = new Map<string, WorkflowScheduleExecutionModel>();
        if (!executionIds || executionIds.size === 0) {
            return resultMap;
        }
        
        const placeholders = Array.from(executionIds).map(() => "?").join(",");
        const sql = `
            SELECT execution_id, schedule_name, workflow_name, workflow_id, reason, 
            stack_trace, state, scheduled_time, execution_time, start_workflow_request 
            FROM workflow_scheduled_executions 
            WHERE execution_id IN (${placeholders})
        `;
        
        const rows = this.db.prepare(sql).all(...Array.from(executionIds));
        
        for (const row of rows) {
            const model = this.mapRowToModel(row);
            resultMap.set(model.executionId, model);
        }
        return resultMap;
    }

    async getExecutionById(executionId: string): Promise<WorkflowScheduleExecutionModel | null> {
        const sql = `
            SELECT execution_id, schedule_name, workflow_name, workflow_id, reason, 
            stack_trace, state, scheduled_time, execution_time, start_workflow_request 
            FROM workflow_scheduled_executions WHERE execution_id = ?
        `;
        const row = this.db.prepare(sql).get(executionId);
        return row ? this.mapRowToModel(row) : null;
    }

    async cleanupOldRecords(archivalMaxRecords: number, archivalMaxRecordThreshold: number): Promise<void> {
        const findSchedulesSql = `
            SELECT schedule_name, COUNT(*) AS cnt 
            FROM workflow_scheduled_executions 
            GROUP BY schedule_name 
            HAVING COUNT(*) > ?
        `;
        
        const scheduleNamesRows = this.db.prepare(findSchedulesSql).all(archivalMaxRecordThreshold);
        
        for (const row of scheduleNamesRows) {
            const scheduleName = row.schedule_name;
            const deleteSql = `
                DELETE FROM workflow_scheduled_executions 
                WHERE schedule_name = ? 
                AND execution_id NOT IN (
                  SELECT execution_id FROM workflow_scheduled_executions 
                  WHERE schedule_name = ? 
                  ORDER BY scheduled_time DESC 
                  LIMIT ?
                )
            `;
            const info = this.db.prepare(deleteSql).run(scheduleName, scheduleName, archivalMaxRecords);
            if (info.changes > 0) {
                console.info(`Cleaned up ${info.changes} old archival records for schedule: ${scheduleName}`);
            }
        }
    }

    private mapRowToModel(row: any): WorkflowScheduleExecutionModel {
        const model = new WorkflowScheduleExecutionModel();
        model.executionId = row.execution_id;
        model.scheduleName = row.schedule_name;
        model.workflowName = row.workflow_name;
        model.workflowId = row.workflow_id;
        model.reason = row.reason;
        model.stackTrace = row.stack_trace;
        if (row.state) {
            model.state = row.state;
        }
        model.scheduledTime = row.scheduled_time;
        model.executionTime = row.execution_time;
        if (row.start_workflow_request) {
            model.startWorkflowRequest = JSON.parse(row.start_workflow_request);
        }
        return model;
    }
}
