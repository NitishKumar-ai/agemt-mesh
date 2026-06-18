import { PostgresBaseDAO } from '../../../../../../../../../../mock';
import { SchedulerArchivalDAO } from '../../../../../../../../../../core/src/main/typescript/io/orkes/conductor/dao/archive/SchedulerArchivalDAO';
import { WorkflowScheduleExecutionModel } from '../../../../../../../../../../mock';
import { SearchResult } from '../../../../../../../../../../mock';
import { SchedulerSearchQuery } from '../../../../../../../../../../core/src/main/typescript/io/orkes/conductor/dao/archive/SchedulerSearchQuery';

export class PostgresSchedulerArchivalDAO extends PostgresBaseDAO implements SchedulerArchivalDAO {
    private static readonly DAO_NAME = "postgres";

    private static readonly SELECT_COLUMNS =
        "execution_id, schedule_name, workflow_name, workflow_id," +
        " reason, stack_trace, state, scheduled_time, execution_time," +
        " start_workflow_request";

    constructor(retryTemplate: any, objectMapper: any, dataSource: any) {
        super(retryTemplate, objectMapper, dataSource);
    }

    async saveExecutionRecord(model: WorkflowScheduleExecutionModel): Promise<void> {
        const sql = `
            INSERT INTO workflow_scheduled_executions
                (execution_id, schedule_name, workflow_name, workflow_id,
                 reason, stack_trace, state, scheduled_time, execution_time,
                 start_workflow_request)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (execution_id)
            DO UPDATE SET schedule_name          = EXCLUDED.schedule_name,
                          workflow_name          = EXCLUDED.workflow_name,
                          workflow_id            = EXCLUDED.workflow_id,
                          reason                 = EXCLUDED.reason,
                          stack_trace            = EXCLUDED.stack_trace,
                          state                  = EXCLUDED.state,
                          scheduled_time         = EXCLUDED.scheduled_time,
                          execution_time         = EXCLUDED.execution_time,
                          start_workflow_request = EXCLUDED.start_workflow_request
        `;
        await this.executeWithTransaction(sql, [
            model.executionId,
            model.scheduleName,
            model.workflowName,
            model.workflowId,
            model.reason,
            model.stackTrace,
            model.state ?? null,
            model.scheduledTime ?? 0,
            model.executionTime ?? 0,
            model.startWorkflowRequest ? this.toJson(model.startWorkflowRequest) : null
        ]);
    }

    async searchScheduledExecutions(
        query: string,
        freeText: string,
        start: number,
        count: number,
        sort: string[]
    ): Promise<SearchResult<string>> {
        let where = " WHERE 1=1";
        const params: any[] = [];
        let paramIndex = 1;

        const parsed = SchedulerSearchQuery.parse(query);
        if (parsed.hasScheduleNames()) {
            const placeholders = parsed.getScheduleNames().map(() => `$${paramIndex++}`).join(",");
            where += ` AND schedule_name IN (${placeholders})`;
            params.push(...parsed.getScheduleNames());
        }
        if (parsed.hasStates()) {
            const placeholders = parsed.getStates().map(() => `$${paramIndex++}`).join(",");
            where += ` AND state IN (${placeholders})`;
            params.push(...parsed.getStates());
        }
        if (parsed.getScheduledTimeAfter() !== null) {
            where += ` AND scheduled_time > $${paramIndex++}`;
            params.push(parsed.getScheduledTimeAfter());
        }
        if (parsed.getScheduledTimeBefore() !== null) {
            where += ` AND scheduled_time < $${paramIndex++}`;
            params.push(parsed.getScheduledTimeBefore());
        }
        if (parsed.hasWorkflowName()) {
            where += ` AND workflow_name ILIKE $${paramIndex++}`;
            params.push("%" + parsed.getWorkflowName() + "%");
        }
        if (parsed.hasExecutionId()) {
            where += ` AND execution_id = $${paramIndex++}`;
            params.push(parsed.getExecutionId());
        }

        const countSql = "SELECT COUNT(*) as count FROM workflow_scheduled_executions" + where;
        const totalHitsRes = await this.queryWithTransactionFirst(countSql, params, (row: any) => row.count);
        const totalHits = parseInt(totalHitsRes || '0', 10);

        const orderBy = this.buildOrderByClause(sort);
        const dataSql = "SELECT execution_id FROM workflow_scheduled_executions" + where + orderBy + ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        const dataParams = [...params, count, start];

        const ids = await this.queryWithTransaction(dataSql, dataParams, (row: any) => row.execution_id);

        return new SearchResult<string>(totalHits, ids);
    }

    private buildOrderByClause(sortOptions: string[]): string {
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

    async getExecutionsByIds(executionIds: Set<string>): Promise<Record<string, WorkflowScheduleExecutionModel>> {
        if (!executionIds || executionIds.size === 0) {
            return {};
        }
        const sql = `SELECT ${PostgresSchedulerArchivalDAO.SELECT_COLUMNS} FROM workflow_scheduled_executions WHERE execution_id = ANY($1)`;
        const list = await this.queryWithTransaction(sql, [Array.from(executionIds)], (row: any) => this.mapRow(row));
        
        const result: Record<string, WorkflowScheduleExecutionModel> = {};
        for (const m of list) {
            result[m.executionId!] = m;
        }
        return result;
    }

    async getExecutionById(executionId: string): Promise<WorkflowScheduleExecutionModel | null> {
        const sql = `SELECT ${PostgresSchedulerArchivalDAO.SELECT_COLUMNS} FROM workflow_scheduled_executions WHERE execution_id = $1`;
        return this.queryWithTransactionFirst(sql, [executionId], (row: any) => this.mapRow(row));
    }

    async cleanupOldRecords(archivalMaxRecords: number, archivalMaxRecordThreshold: number): Promise<void> {
        const schedSql = "SELECT schedule_name FROM workflow_scheduled_executions GROUP BY schedule_name HAVING COUNT(*) > $1";
        const scheduleNames = await this.queryWithTransaction(schedSql, [archivalMaxRecordThreshold], (row: any) => row.schedule_name);

        for (const scheduleName of scheduleNames) {
            const deleteSql = `
                DELETE FROM workflow_scheduled_executions
                WHERE execution_id IN (
                    SELECT execution_id FROM workflow_scheduled_executions
                    WHERE schedule_name = $1
                    ORDER BY scheduled_time DESC
                    OFFSET $2
                )
            `;
            await this.executeWithTransaction(deleteSql, [scheduleName, archivalMaxRecords]);
        }
    }

    private mapRow(row: any): WorkflowScheduleExecutionModel {
        const model = new WorkflowScheduleExecutionModel();
        model.executionId = row.execution_id;
        model.scheduleName = row.schedule_name;
        model.workflowName = row.workflow_name;
        model.workflowId = row.workflow_id;
        model.reason = row.reason;
        model.stackTrace = row.stack_trace;
        if (row.state) {
            model.state = row.state as any;
        }
        model.scheduledTime = row.scheduled_time;
        model.executionTime = row.execution_time;
        
        const swrJson = row.start_workflow_request;
        if (swrJson) {
            try {
                model.startWorkflowRequest = typeof swrJson === 'string' ? JSON.parse(swrJson) : swrJson;
            } catch (e) {
                throw new Error("Failed to deserialize StartWorkflowRequest");
            }
        }
        return model;
    }
}
