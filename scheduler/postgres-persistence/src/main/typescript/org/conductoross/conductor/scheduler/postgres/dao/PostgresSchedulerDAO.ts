import { PostgresBaseDAO } from '../../../../../../../../../../mock';
import { SchedulerDAO } from '../../../../../../../../../../core/src/main/typescript/io/orkes/conductor/dao/scheduler/SchedulerDAO';
import { WorkflowScheduleModel, WorkflowScheduleExecutionModel } from '../../../../../../../../../../mock';
import { SearchResult } from '../../../../../../../../../../mock';

export class PostgresSchedulerDAO extends PostgresBaseDAO implements SchedulerDAO {
    private static readonly DAO_NAME = "postgres";

    constructor(retryTemplate: any, objectMapper: any, dataSource: any) {
        super(retryTemplate, objectMapper, dataSource);
    }

    async updateSchedule(schedule: WorkflowScheduleModel): Promise<void> {
        await this.withTransaction(async (tx: any) => {
            await this.execute(
                tx,
                `
                INSERT INTO scheduler (scheduler_name, workflow_name, json_data, next_run_time)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (scheduler_name)
                DO UPDATE SET workflow_name = EXCLUDED.workflow_name,
                              json_data     = EXCLUDED.json_data,
                              next_run_time = EXCLUDED.next_run_time
                `,
                [
                    schedule.name,
                    schedule.startWorkflowRequest?.name ?? null,
                    this.toJson(schedule),
                    schedule.nextRunTime
                ]
            );

            await this.execute(
                tx,
                "DELETE FROM scheduler_next_run WHERE key = $1",
                [schedule.name]
            );
        });
    }

    async findScheduleByName(name: string): Promise<WorkflowScheduleModel | null> {
        const sql = "SELECT json_data FROM scheduler WHERE scheduler_name = $1";
        return this.queryWithTransactionFirst(sql, [name], (row: any) => row.json_data);
    }

    async getAllSchedules(): Promise<WorkflowScheduleModel[]> {
        return this.queryWithTransaction("SELECT json_data FROM scheduler", [], (row: any) => row.json_data);
    }

    async findAllSchedules(workflowName: string): Promise<WorkflowScheduleModel[]> {
        const sql = "SELECT json_data FROM scheduler WHERE workflow_name = $1";
        return this.queryWithTransaction(sql, [workflowName], (row: any) => row.json_data);
    }

    async findAllByNames(names: Set<string>): Promise<Record<string, WorkflowScheduleModel>> {
        if (!names || names.size === 0) {
            return {};
        }
        const sql = "SELECT json_data FROM scheduler WHERE scheduler_name = ANY($1)";
        const schedules = await this.queryWithTransaction(sql, [Array.from(names)], (row: any) => row.json_data);
        
        const result: Record<string, WorkflowScheduleModel> = {};
        for (const s of schedules) {
            result[s.name] = s;
        }
        return result;
    }

    async deleteWorkflowSchedule(name: string): Promise<void> {
        await this.withTransaction(async (tx: any) => {
            await this.execute(tx, "DELETE FROM scheduler_execution WHERE schedule_name = $1", [name]);
            await this.execute(tx, "DELETE FROM scheduler_next_run WHERE key = $1", [name]);
            await this.execute(tx, "DELETE FROM scheduler WHERE scheduler_name = $1", [name]);
        });
    }

    async saveExecutionRecord(execution: WorkflowScheduleExecutionModel): Promise<void> {
        const sql = `
            INSERT INTO scheduler_execution (execution_id, schedule_name, state, json_data)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (execution_id)
            DO UPDATE SET state     = EXCLUDED.state,
                          json_data = EXCLUDED.json_data
        `;
        await this.executeWithTransaction(sql, [
            execution.executionId,
            execution.scheduleName,
            execution.state ?? null,
            this.toJson(execution)
        ]);
    }

    async readExecutionRecord(executionId: string): Promise<WorkflowScheduleExecutionModel | null> {
        const sql = "SELECT json_data FROM scheduler_execution WHERE execution_id = $1";
        return this.queryWithTransactionFirst(sql, [executionId], (row: any) => row.json_data);
    }

    async removeExecutionRecord(executionId: string): Promise<void> {
        await this.executeWithTransaction("DELETE FROM scheduler_execution WHERE execution_id = $1", [executionId]);
    }

    async getPendingExecutionRecordIds(): Promise<string[]> {
        return this.queryWithTransaction("SELECT execution_id FROM scheduler_execution WHERE state = 'POLLED'", [], (row: any) => row.execution_id);
    }

    async getNextRunTimeInEpoch(scheduleName: string): Promise<number> {
        const sql = "SELECT epoch_millis FROM scheduler_next_run WHERE key = $1";
        const result = await this.queryWithTransactionFirst(sql, [scheduleName], (row: any) => row.epoch_millis);
        return result ?? -1;
    }

    async setNextRunTimeInEpoch(scheduleName: string, epochMillis: number): Promise<void> {
        const sql = `
            INSERT INTO scheduler_next_run (key, epoch_millis)
            VALUES ($1, $2)
            ON CONFLICT (key) DO UPDATE SET epoch_millis = EXCLUDED.epoch_millis
        `;
        await this.executeWithTransaction(sql, [scheduleName, epochMillis]);
    }

    async searchSchedules(
        workflowName: string | null,
        scheduleName: string | null,
        paused: boolean | null,
        freeText: string | null,
        start: number,
        size: number,
        sortOptions: string[]
    ): Promise<SearchResult<WorkflowScheduleModel>> {
        let where = " WHERE 1=1";
        const params: any[] = [];
        let paramIndex = 1;

        if (workflowName) {
            where += ` AND workflow_name = $${paramIndex++}`;
            params.push(workflowName);
        }
        if (scheduleName) {
            where += ` AND scheduler_name ILIKE $${paramIndex++} ESCAPE '\\'`;
            const escaped = scheduleName.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
            params.push("%" + escaped + "%");
        }
        if (paused !== null) {
            where += ` AND (json_data::jsonb->>'paused')::boolean = $${paramIndex++}`;
            params.push(paused);
        }

        const countSql = "SELECT COUNT(*) as count FROM scheduler" + where;
        const totalHitsRes = await this.queryWithTransactionFirst(countSql, params, (row: any) => row.count);
        const totalHits = parseInt(totalHitsRes || '0', 10);

        const dataSql = "SELECT json_data FROM scheduler" + where + ` ORDER BY scheduler_name LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        const dataParams = [...params, size, start];

        const results = await this.queryWithTransaction(dataSql, dataParams, (row: any) => row.json_data);

        return new SearchResult<WorkflowScheduleModel>(totalHits, results);
    }
}
