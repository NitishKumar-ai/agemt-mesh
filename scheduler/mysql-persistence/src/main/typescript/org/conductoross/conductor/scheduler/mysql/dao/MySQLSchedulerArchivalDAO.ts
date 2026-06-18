import { MySQLBaseDAO } from '../../../../../../../../../../mock';
import { SchedulerArchivalDAO } from '../../../../../../../../../../core/src/main/typescript/io/orkes/conductor/dao/archive/SchedulerArchivalDAO';
import { SchedulerSearchQuery } from '../../../../../../../../../../core/src/main/typescript/io/orkes/conductor/dao/archive/SchedulerSearchQuery';
import { WorkflowScheduleExecutionModel } from '../../../../../../../../../../mock';
import { SearchResult } from '../../../../../../../../../../mock';
import { Monitors } from '../../../../../../../../../../mock';

export class MySQLSchedulerArchivalDAO extends MySQLBaseDAO implements SchedulerArchivalDAO {
    private static readonly DAO_NAME = "mysql";
    private static readonly SELECT_COLUMNS =
        "execution_id, schedule_name, workflow_name, workflow_id," +
        " reason, stack_trace, state, scheduled_time, execution_time," +
        " start_workflow_request";

    constructor(retryTemplate: any, objectMapper: any, dataSource: any) {
        super(retryTemplate, objectMapper, dataSource);
    }

    public async saveExecutionRecord(model: WorkflowScheduleExecutionModel): Promise<void> {
        Monitors.recordDaoRequests(MySQLSchedulerArchivalDAO.DAO_NAME, "saveArchivalRecord", "n/a", "n/a");
        const sql =
            "INSERT INTO workflow_scheduled_executions" +
            " (execution_id, schedule_name, workflow_name, workflow_id," +
            "  reason, stack_trace, state, scheduled_time, execution_time," +
            "  start_workflow_request)" +
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)" +
            " ON DUPLICATE KEY UPDATE" +
            "    schedule_name          = VALUES(schedule_name)," +
            "    workflow_name          = VALUES(workflow_name)," +
            "    workflow_id            = VALUES(workflow_id)," +
            "    reason                 = VALUES(reason)," +
            "    stack_trace            = VALUES(stack_trace)," +
            "    state                  = VALUES(state)," +
            "    scheduled_time         = VALUES(scheduled_time)," +
            "    execution_time         = VALUES(execution_time)," +
            "    start_workflow_request = VALUES(start_workflow_request)";

        await this.executeWithTransaction(sql, (q: any) => {
            q.addParameter(model.getExecutionId())
             .addParameter(model.getScheduleName())
             .addParameter(model.getWorkflowName())
             .addParameter(model.getWorkflowId())
             .addParameter(model.getReason())
             .addParameter(model.getStackTrace())
             .addParameter(model.getState() ? model.getState().toString() : null)
             .addParameter(model.getScheduledTime() !== null && model.getScheduledTime() !== undefined ? model.getScheduledTime() : 0)
             .addParameter(model.getExecutionTime() !== null && model.getExecutionTime() !== undefined ? model.getExecutionTime() : 0)
             .addParameter(model.getStartWorkflowRequest() ? this.toJson(model.getStartWorkflowRequest()) : null)
             .executeUpdate();
        });
    }

    public async searchScheduledExecutions(
        query: string,
        freeText: string,
        start: number,
        count: number,
        sort: string[]
    ): Promise<SearchResult<string>> {
        Monitors.recordDaoRequests(MySQLSchedulerArchivalDAO.DAO_NAME, "searchScheduledExecutions", "n/a", "n/a");
        let where = " WHERE 1=1";
        const params: any[] = [];

        const parsed = SchedulerSearchQuery.parse(query);
        if (parsed.hasScheduleNames()) {
            const placeholders = parsed.getScheduleNames().map(() => '?').join(',');
            where += ` AND schedule_name IN (${placeholders})`;
            params.push(...parsed.getScheduleNames());
        }
        if (parsed.hasStates()) {
            const placeholders = parsed.getStates().map(() => '?').join(',');
            where += ` AND state IN (${placeholders})`;
            params.push(...parsed.getStates());
        }
        if (parsed.getScheduledTimeAfter() !== null && parsed.getScheduledTimeAfter() !== undefined) {
            where += " AND scheduled_time > ?";
            params.push(parsed.getScheduledTimeAfter());
        }
        if (parsed.getScheduledTimeBefore() !== null && parsed.getScheduledTimeBefore() !== undefined) {
            where += " AND scheduled_time < ?";
            params.push(parsed.getScheduledTimeBefore());
        }
        if (parsed.hasWorkflowName()) {
            where += " AND workflow_name LIKE ?";
            params.push("%" + parsed.getWorkflowName() + "%");
        }
        if (parsed.hasExecutionId()) {
            where += " AND execution_id = ?";
            params.push(parsed.getExecutionId());
        }

        const countSql = "SELECT COUNT(*) FROM workflow_scheduled_executions" + where;
        const totalHits: number = await this.queryWithTransaction(
            countSql,
            (q: any) => q.addParameters(params).executeCount()
        );

        const orderBy = MySQLSchedulerArchivalDAO.buildOrderByClause(sort);
        const dataSql =
            "SELECT execution_id FROM workflow_scheduled_executions" +
            where +
            orderBy +
            " LIMIT ? OFFSET ?";

        const dataParams = [...params, count, start];
        const ids: string[] = await this.queryWithTransaction(
            dataSql,
            (q: any) => q.addParameters(dataParams).executeScalarList(String)
        );

        return new SearchResult<string>(totalHits, ids);
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

    public async getExecutionsByIds(executionIds: Set<string>): Promise<Map<string, WorkflowScheduleExecutionModel>> {
        Monitors.recordDaoRequests(MySQLSchedulerArchivalDAO.DAO_NAME, "getExecutionsByIds", "n/a", "n/a");
        if (!executionIds || executionIds.size === 0) {
            return new Map();
        }
        const executionIdsArray = Array.from(executionIds);
        const placeholders = executionIdsArray.map(() => '?').join(',');
        const sql =
            "SELECT " +
            MySQLSchedulerArchivalDAO.SELECT_COLUMNS +
            " FROM workflow_scheduled_executions WHERE execution_id IN (" +
            placeholders +
            ")";

        const list: WorkflowScheduleExecutionModel[] = await this.queryWithTransaction(
            sql,
            (q: any) => {
                for (const id of executionIdsArray) {
                    q.addParameter(id);
                }
                return q.executeAndFetch(this.mapRows.bind(this));
            }
        );

        const result = new Map<string, WorkflowScheduleExecutionModel>();
        for (const m of list) {
            result.set(m.getExecutionId(), m);
        }
        return result;
    }

    public async getExecutionById(executionId: string): Promise<WorkflowScheduleExecutionModel | null> {
        Monitors.recordDaoRequests(MySQLSchedulerArchivalDAO.DAO_NAME, "getExecutionById", "n/a", "n/a");
        const sql =
            "SELECT " +
            MySQLSchedulerArchivalDAO.SELECT_COLUMNS +
            " FROM workflow_scheduled_executions WHERE execution_id = ?";

        return this.queryWithTransaction(sql, (q: any) => {
            q.addParameter(executionId);
            const list = q.executeAndFetch(this.mapRows.bind(this));
            return list.length === 0 ? null : list[0];
        });
    }

    public async cleanupOldRecords(archivalMaxRecords: number, archivalMaxRecordThreshold: number): Promise<void> {
        Monitors.recordDaoRequests(MySQLSchedulerArchivalDAO.DAO_NAME, "cleanupOldRecords", "n/a", "n/a");
        const schedSql =
            "SELECT schedule_name FROM workflow_scheduled_executions" +
            " GROUP BY schedule_name HAVING COUNT(*) > ?";
        
        const scheduleNames: string[] = await this.queryWithTransaction(
            schedSql,
            (q: any) => q.addParameter(archivalMaxRecordThreshold).executeScalarList(String)
        );

        for (const scheduleName of scheduleNames) {
            const keepSql =
                "SELECT execution_id FROM workflow_scheduled_executions" +
                " WHERE schedule_name = ?" +
                " ORDER BY scheduled_time DESC LIMIT ?";
            
            const keepIds: string[] = await this.queryWithTransaction(
                keepSql,
                (q: any) => q.addParameter(scheduleName).addParameter(archivalMaxRecords).executeScalarList(String)
            );

            if (keepIds.length === 0) {
                continue;
            }

            const placeholders = keepIds.map(() => '?').join(',');
            const deleteSql =
                "DELETE FROM workflow_scheduled_executions" +
                " WHERE schedule_name = ? AND execution_id NOT IN (" +
                placeholders +
                ")";

            await this.executeWithTransaction(
                deleteSql,
                (q: any) => {
                    q.addParameter(scheduleName);
                    for (const id of keepIds) {
                        q.addParameter(id);
                    }
                    q.executeDelete();
                }
            );
        }
    }

    private mapRows(rs: any): WorkflowScheduleExecutionModel[] {
        const list: WorkflowScheduleExecutionModel[] = [];
        while (rs.next()) {
            list.push(this.mapRow(rs));
        }
        return list;
    }

    private mapRow(rs: any): WorkflowScheduleExecutionModel {
        const model = new WorkflowScheduleExecutionModel();
        model.setExecutionId(rs.getString("execution_id"));
        model.setScheduleName(rs.getString("schedule_name"));
        model.setWorkflowName(rs.getString("workflow_name"));
        model.setWorkflowId(rs.getString("workflow_id"));
        model.setReason(rs.getString("reason"));
        model.setStackTrace(rs.getString("stack_trace"));
        
        const stateStr = rs.getString("state");
        if (stateStr) {
            model.setState(stateStr);
        }
        
        const scheduledTime = rs.getLong("scheduled_time");
        model.setScheduledTime(rs.wasNull() ? null : scheduledTime);
        
        const executionTime = rs.getLong("execution_time");
        model.setExecutionTime(rs.wasNull() ? null : executionTime);
        
        const swrJson = rs.getString("start_workflow_request");
        if (swrJson) {
            try {
                // @ts-ignore
                model.setStartWorkflowRequest(this.objectMapper.readValue(swrJson));
            } catch (e) {
                throw new Error("Failed to deserialize StartWorkflowRequest");
            }
        }
        return model;
    }
}
