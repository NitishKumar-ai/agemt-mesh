import { MySQLBaseDAO } from '../../../../../../../../../../mock';
import { SchedulerDAO } from '../../../../../../../../../../core/src/main/typescript/io/orkes/conductor/dao/scheduler/SchedulerDAO';
import { WorkflowScheduleModel, WorkflowScheduleExecutionModel } from '../../../../../../../../../../mock';
import { SearchResult } from '../../../../../../../../../../mock';
import { Monitors } from '../../../../../../../../../../mock';

export class MySQLSchedulerDAO extends MySQLBaseDAO implements SchedulerDAO {
    private static readonly DAO_NAME = "mysql";

    constructor(retryTemplate: any, objectMapper: any, dataSource: any) {
        super(retryTemplate, objectMapper, dataSource);
    }

    public async updateSchedule(schedule: WorkflowScheduleModel): Promise<void> {
        Monitors.recordDaoRequests(MySQLSchedulerDAO.DAO_NAME, "updateSchedule", "n/a", "n/a");
        await this.withTransaction(async (tx: any) => {
            await this.execute(
                tx,
                "INSERT INTO scheduler (scheduler_name, workflow_name, json_data, next_run_time) " +
                "VALUES (?, ?, ?, ?) " +
                "ON DUPLICATE KEY UPDATE " +
                "    workflow_name = VALUES(workflow_name), " +
                "    json_data = VALUES(json_data), " +
                "    next_run_time = VALUES(next_run_time)",
                (q: any) => {
                    q.addParameter(schedule.getName())
                     .addParameter(schedule.getStartWorkflowRequest() ? schedule.getStartWorkflowRequest().getName() : null)
                     .addParameter(this.toJson(schedule))
                     .addParameter(schedule.getNextRunTime())
                     .executeUpdate();
                }
            );
            await this.execute(
                tx,
                "DELETE FROM scheduler_next_run WHERE `key` = ?",
                (q: any) => q.addParameter(schedule.getName()).executeDelete()
            );
        });
    }

    public async findScheduleByName(name: string): Promise<WorkflowScheduleModel | null> {
        Monitors.recordDaoRequests(MySQLSchedulerDAO.DAO_NAME, "findScheduleByName", "n/a", "n/a");
        const sql = "SELECT json_data FROM scheduler WHERE scheduler_name = ?";
        return this.queryWithTransaction(
            sql,
            (q: any) => q.addParameter(name).executeAndFetchFirst(WorkflowScheduleModel)
        );
    }

    public async getAllSchedules(): Promise<WorkflowScheduleModel[]> {
        Monitors.recordDaoRequests(MySQLSchedulerDAO.DAO_NAME, "getAllSchedules", "n/a", "n/a");
        return this.queryWithTransaction(
            "SELECT json_data FROM scheduler",
            (q: any) => q.executeAndFetch(WorkflowScheduleModel)
        );
    }

    public async findAllSchedules(workflowName: string): Promise<WorkflowScheduleModel[]> {
        Monitors.recordDaoRequests(MySQLSchedulerDAO.DAO_NAME, "findAllSchedules", "n/a", "n/a");
        const sql = "SELECT json_data FROM scheduler WHERE workflow_name = ?";
        return this.queryWithTransaction(
            sql,
            (q: any) => q.addParameter(workflowName).executeAndFetch(WorkflowScheduleModel)
        );
    }

    public async findAllByNames(names: Set<string>): Promise<Map<string, WorkflowScheduleModel>> {
        Monitors.recordDaoRequests(MySQLSchedulerDAO.DAO_NAME, "findAllByNames", "n/a", "n/a");
        if (!names || names.size === 0) {
            return new Map();
        }
        const namesArray = Array.from(names);
        const placeholders = namesArray.map(() => '?').join(',');
        const schedules: WorkflowScheduleModel[] = await this.queryWithTransaction(
            `SELECT json_data FROM scheduler WHERE scheduler_name IN (${placeholders})`,
            (q: any) => {
                for (const name of namesArray) {
                    q.addParameter(name);
                }
                return q.executeAndFetch(WorkflowScheduleModel);
            }
        );
        const result = new Map<string, WorkflowScheduleModel>();
        for (const s of schedules) {
            result.set(s.getName(), s);
        }
        return result;
    }

    public async deleteWorkflowSchedule(name: string): Promise<void> {
        Monitors.recordDaoRequests(MySQLSchedulerDAO.DAO_NAME, "deleteWorkflowSchedule", "n/a", "n/a");
        await this.withTransaction(async (tx: any) => {
            await this.execute(
                tx,
                "DELETE FROM scheduler_execution WHERE schedule_name = ?",
                (q: any) => q.addParameter(name).executeDelete()
            );
            await this.execute(
                tx,
                "DELETE FROM scheduler_next_run WHERE `key` = ?",
                (q: any) => q.addParameter(name).executeDelete()
            );
            await this.execute(
                tx,
                "DELETE FROM scheduler WHERE scheduler_name = ?",
                (q: any) => q.addParameter(name).executeDelete()
            );
        });
    }

    public async saveExecutionRecord(execution: WorkflowScheduleExecutionModel): Promise<void> {
        Monitors.recordDaoRequests(MySQLSchedulerDAO.DAO_NAME, "saveExecutionRecord", "n/a", "n/a");
        const sql =
            "INSERT INTO scheduler_execution (execution_id, schedule_name, state, json_data) " +
            "VALUES (?, ?, ?, ?) " +
            "ON DUPLICATE KEY UPDATE " +
            "    state     = VALUES(state), " +
            "    json_data = VALUES(json_data)";
        await this.executeWithTransaction(
            sql,
            (q: any) => q.addParameter(execution.getExecutionId())
                    .addParameter(execution.getScheduleName())
                    .addParameter(execution.getState() ? execution.getState().toString() : null)
                    .addParameter(this.toJson(execution))
                    .executeUpdate()
        );
    }

    public async readExecutionRecord(executionId: string): Promise<WorkflowScheduleExecutionModel | null> {
        Monitors.recordDaoRequests(MySQLSchedulerDAO.DAO_NAME, "readExecutionRecord", "n/a", "n/a");
        const sql = "SELECT json_data FROM scheduler_execution WHERE execution_id = ?";
        return this.queryWithTransaction(
            sql,
            (q: any) => q.addParameter(executionId).executeAndFetchFirst(WorkflowScheduleExecutionModel)
        );
    }

    public async removeExecutionRecord(executionId: string): Promise<void> {
        Monitors.recordDaoRequests(MySQLSchedulerDAO.DAO_NAME, "removeExecutionRecord", "n/a", "n/a");
        await this.executeWithTransaction(
            "DELETE FROM scheduler_execution WHERE execution_id = ?",
            (q: any) => q.addParameter(executionId).executeDelete()
        );
    }

    public async getPendingExecutionRecordIds(): Promise<string[]> {
        Monitors.recordDaoRequests(MySQLSchedulerDAO.DAO_NAME, "getPendingExecutionRecordIds", "n/a", "n/a");
        return this.queryWithTransaction(
            "SELECT execution_id FROM scheduler_execution WHERE state = 'POLLED'",
            (q: any) => q.executeScalarList(String)
        );
    }

    public async getNextRunTimeInEpoch(scheduleName: string): Promise<number> {
        Monitors.recordDaoRequests(MySQLSchedulerDAO.DAO_NAME, "getNextRunTimeInEpoch", "n/a", "n/a");
        const sql = "SELECT epoch_millis FROM scheduler_next_run WHERE `key` = ?";
        const result = await this.queryWithTransaction(
            sql,
            (q: any) => q.addParameter(scheduleName).executeAndFetchFirst(Number)
        );
        return result !== null && result !== undefined ? result : -1;
    }

    public async setNextRunTimeInEpoch(scheduleName: string, epochMillis: number): Promise<void> {
        Monitors.recordDaoRequests(MySQLSchedulerDAO.DAO_NAME, "setNextRunTimeInEpoch", "n/a", "n/a");
        await this.executeWithTransaction(
            "INSERT INTO scheduler_next_run (`key`, epoch_millis) VALUES (?, ?) " +
            "ON DUPLICATE KEY UPDATE epoch_millis = VALUES(epoch_millis)",
            (q: any) => q.addParameter(scheduleName).addParameter(epochMillis).executeUpdate()
        );
    }

    public async searchSchedules(
        workflowName: string,
        scheduleName: string,
        paused: boolean | null,
        freeText: string,
        start: number,
        size: number,
        sortOptions: string[]
    ): Promise<SearchResult<WorkflowScheduleModel>> {
        Monitors.recordDaoRequests(MySQLSchedulerDAO.DAO_NAME, "searchSchedules", "n/a", "n/a");
        let sql = "SELECT json_data FROM scheduler WHERE 1=1";
        let countSql = "SELECT COUNT(*) FROM scheduler WHERE 1=1";
        const params: any[] = [];
        const countParams: any[] = [];

        if (workflowName) {
            sql += " AND workflow_name = ?";
            countSql += " AND workflow_name = ?";
            params.push(workflowName);
            countParams.push(workflowName);
        }
        if (scheduleName) {
            sql += " AND scheduler_name LIKE ? ESCAPE '\\\\'";
            countSql += " AND scheduler_name LIKE ? ESCAPE '\\\\'";
            const escaped = scheduleName.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
            params.push("%" + escaped + "%");
            countParams.push("%" + escaped + "%");
        }
        if (paused !== null && paused !== undefined) {
            sql += " AND JSON_EXTRACT(json_data, '$.paused') = ?";
            countSql += " AND JSON_EXTRACT(json_data, '$.paused') = ?";
            params.push(paused);
            countParams.push(paused);
        }

        const totalHits: number = await this.queryWithTransaction(
            countSql,
            (q: any) => {
                q.addParameters(countParams);
                return q.executeCount();
            }
        );

        sql += " ORDER BY scheduler_name ASC LIMIT ? OFFSET ?";
        params.push(size, start);

        const results: WorkflowScheduleModel[] = await this.queryWithTransaction(
            sql,
            (q: any) => {
                q.addParameters(params);
                return q.executeAndFetch(WorkflowScheduleModel);
            }
        );

        return new SearchResult<WorkflowScheduleModel>(totalHits, results);
    }
}
