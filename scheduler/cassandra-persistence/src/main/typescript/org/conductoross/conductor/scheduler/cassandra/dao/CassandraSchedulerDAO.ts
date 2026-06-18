import { CassandraBaseDAO } from '../../../../../../../../../../mock';
import { CassandraProperties } from '../../../../../../../../../../mock';
import { SearchResult } from '../../../../../../../../../../mock';
import { NonTransientException } from '../../../../../../../../../../mock';
import { Monitors } from '../../../../../../../../../../mock';

import { Client } from 'cassandra-driver';
import { SchedulerDAO } from '../../../../../../../../../../core/src/main/typescript/io/orkes/conductor/dao/scheduler/SchedulerDAO';
import { WorkflowScheduleExecutionModel, State } from '../../../../../../../../../../core/src/main/typescript/io/orkes/conductor/scheduler/model/WorkflowScheduleExecutionModel';
import { WorkflowScheduleModel } from '../../../../../../../../../../core/src/main/typescript/io/orkes/conductor/scheduler/model/WorkflowScheduleModel';

export class CassandraSchedulerDAO extends CassandraBaseDAO implements SchedulerDAO {
    private static readonly log = console;
    private static readonly DAO_NAME = "cassandra";

    private static readonly TABLE_SCHEDULES = "scheduler_schedules";
    private static readonly TABLE_EXECUTIONS = "scheduler_executions";
    private static readonly TABLE_EXEC_BY_SCHEDULE = "scheduler_exec_by_schedule";
    private static readonly TABLE_EXEC_BY_STATE = "scheduler_exec_by_state";
    private static readonly TABLE_SCHED_BY_WORKFLOW = "scheduler_sched_by_workflow";

    private upsertScheduleStmt!: string;
    private selectScheduleByNameStmt!: string;
    private selectAllSchedulesStmt!: string;
    private deleteScheduleStmt!: string;
    private updateNextRunTimeStmt!: string;
    private selectNextRunTimeStmt!: string;

    private upsertExecutionStmt!: string;
    private selectExecutionByIdStmt!: string;
    private deleteExecutionStmt!: string;

    private insertExecByScheduleStmt!: string;
    private selectExecByScheduleStmt!: string;
    private deleteExecByScheduleStmt!: string;
    private insertExecByStateStmt!: string;
    private selectExecByStateStmt!: string;
    private deleteExecByStateStmt!: string;
    private insertSchedByWorkflowStmt!: string;
    private selectSchedByWorkflowStmt!: string;
    private deleteSchedByWorkflowStmt!: string;

    constructor(session: Client, properties: CassandraProperties) {
        super(session, properties);
        this.prepareStatements();
    }

    public async ensureTables(): Promise<void> {
        const ks = this.properties.getKeyspace();
        await this.session.execute(`CREATE TABLE IF NOT EXISTS ${ks}.${CassandraSchedulerDAO.TABLE_SCHEDULES} (scheduler_name text PRIMARY KEY, workflow_name text, json_data text, next_run_time bigint)`);
        await this.session.execute(`CREATE TABLE IF NOT EXISTS ${ks}.${CassandraSchedulerDAO.TABLE_EXECUTIONS} (execution_id text PRIMARY KEY, schedule_name text, state text, json_data text)`);
        await this.session.execute(`CREATE TABLE IF NOT EXISTS ${ks}.${CassandraSchedulerDAO.TABLE_EXEC_BY_SCHEDULE} (schedule_name text, execution_id text, PRIMARY KEY (schedule_name, execution_id))`);
        await this.session.execute(`CREATE TABLE IF NOT EXISTS ${ks}.${CassandraSchedulerDAO.TABLE_EXEC_BY_STATE} (state text, execution_id text, PRIMARY KEY (state, execution_id))`);
        await this.session.execute(`CREATE TABLE IF NOT EXISTS ${ks}.${CassandraSchedulerDAO.TABLE_SCHED_BY_WORKFLOW} (workflow_name text, scheduler_name text, PRIMARY KEY (workflow_name, scheduler_name))`);
    }

    private prepareStatements(): void {
        const ks = this.properties.getKeyspace();
        this.upsertScheduleStmt = `INSERT INTO ${ks}.${CassandraSchedulerDAO.TABLE_SCHEDULES} (scheduler_name, workflow_name, json_data, next_run_time) VALUES (?, ?, ?, ?)`;
        this.selectScheduleByNameStmt = `SELECT json_data FROM ${ks}.${CassandraSchedulerDAO.TABLE_SCHEDULES} WHERE scheduler_name = ?`;
        this.selectAllSchedulesStmt = `SELECT json_data FROM ${ks}.${CassandraSchedulerDAO.TABLE_SCHEDULES}`;
        this.deleteScheduleStmt = `DELETE FROM ${ks}.${CassandraSchedulerDAO.TABLE_SCHEDULES} WHERE scheduler_name = ?`;
        this.updateNextRunTimeStmt = `UPDATE ${ks}.${CassandraSchedulerDAO.TABLE_SCHEDULES} SET next_run_time = ? WHERE scheduler_name = ?`;
        this.selectNextRunTimeStmt = `SELECT next_run_time FROM ${ks}.${CassandraSchedulerDAO.TABLE_SCHEDULES} WHERE scheduler_name = ?`;

        this.upsertExecutionStmt = `INSERT INTO ${ks}.${CassandraSchedulerDAO.TABLE_EXECUTIONS} (execution_id, schedule_name, state, json_data) VALUES (?, ?, ?, ?)`;
        this.selectExecutionByIdStmt = `SELECT json_data, state FROM ${ks}.${CassandraSchedulerDAO.TABLE_EXECUTIONS} WHERE execution_id = ?`;
        this.deleteExecutionStmt = `DELETE FROM ${ks}.${CassandraSchedulerDAO.TABLE_EXECUTIONS} WHERE execution_id = ?`;

        this.insertExecByScheduleStmt = `INSERT INTO ${ks}.${CassandraSchedulerDAO.TABLE_EXEC_BY_SCHEDULE} (schedule_name, execution_id) VALUES (?, ?)`;
        this.selectExecByScheduleStmt = `SELECT execution_id FROM ${ks}.${CassandraSchedulerDAO.TABLE_EXEC_BY_SCHEDULE} WHERE schedule_name = ?`;
        this.deleteExecByScheduleStmt = `DELETE FROM ${ks}.${CassandraSchedulerDAO.TABLE_EXEC_BY_SCHEDULE} WHERE schedule_name = ? AND execution_id = ?`;
        this.insertExecByStateStmt = `INSERT INTO ${ks}.${CassandraSchedulerDAO.TABLE_EXEC_BY_STATE} (state, execution_id) VALUES (?, ?)`;
        this.selectExecByStateStmt = `SELECT execution_id FROM ${ks}.${CassandraSchedulerDAO.TABLE_EXEC_BY_STATE} WHERE state = ?`;
        this.deleteExecByStateStmt = `DELETE FROM ${ks}.${CassandraSchedulerDAO.TABLE_EXEC_BY_STATE} WHERE state = ? AND execution_id = ?`;
        this.insertSchedByWorkflowStmt = `INSERT INTO ${ks}.${CassandraSchedulerDAO.TABLE_SCHED_BY_WORKFLOW} (workflow_name, scheduler_name) VALUES (?, ?)`;
        this.selectSchedByWorkflowStmt = `SELECT scheduler_name FROM ${ks}.${CassandraSchedulerDAO.TABLE_SCHED_BY_WORKFLOW} WHERE workflow_name = ?`;
        this.deleteSchedByWorkflowStmt = `DELETE FROM ${ks}.${CassandraSchedulerDAO.TABLE_SCHED_BY_WORKFLOW} WHERE workflow_name = ? AND scheduler_name = ?`;
    }

    async updateSchedule(schedule: WorkflowScheduleModel): Promise<void> {
        Monitors.recordDaoRequests(CassandraSchedulerDAO.DAO_NAME, "updateSchedule", "n/a", "n/a");

        const existing = await this.session.execute(this.selectScheduleByNameStmt, [schedule.name], { prepare: true });
        if (existing.rowLength > 0) {
            const old = this.fromJson<WorkflowScheduleModel>(existing.first().get('json_data'));
            if (old.startWorkflowRequest && old.startWorkflowRequest.name) {
                const oldWf = old.startWorkflowRequest.name;
                const newWf = schedule.startWorkflowRequest ? schedule.startWorkflowRequest.name : null;
                if (oldWf !== newWf) {
                    await this.session.execute(this.deleteSchedByWorkflowStmt, [oldWf, schedule.name], { prepare: true });
                }
            }
        }

        await this.session.execute(this.upsertScheduleStmt, [
            schedule.name,
            schedule.startWorkflowRequest ? schedule.startWorkflowRequest.name : null,
            this.toJson(schedule),
            schedule.nextRunTime
        ], { prepare: true });

        if (schedule.startWorkflowRequest && schedule.startWorkflowRequest.name) {
            await this.session.execute(this.insertSchedByWorkflowStmt, [schedule.startWorkflowRequest.name, schedule.name], { prepare: true });
        }
    }

    async findScheduleByName(name: string): Promise<WorkflowScheduleModel | null> {
        Monitors.recordDaoRequests(CassandraSchedulerDAO.DAO_NAME, "findScheduleByName", "n/a", "n/a");
        const rs = await this.session.execute(this.selectScheduleByNameStmt, [name], { prepare: true });
        if (rs.rowLength === 0) return null;
        return this.fromJson<WorkflowScheduleModel>(rs.first().get('json_data'));
    }

    async getAllSchedules(): Promise<WorkflowScheduleModel[]> {
        Monitors.recordDaoRequests(CassandraSchedulerDAO.DAO_NAME, "getAllSchedules", "n/a", "n/a");
        const rs = await this.session.execute(this.selectAllSchedulesStmt, [], { prepare: true });
        return rs.rows.map(row => this.fromJson<WorkflowScheduleModel>(row.get('json_data')));
    }

    async findAllSchedules(workflowName: string): Promise<WorkflowScheduleModel[]> {
        Monitors.recordDaoRequests(CassandraSchedulerDAO.DAO_NAME, "findAllSchedules", "n/a", "n/a");
        const lookupRows = await this.session.execute(this.selectSchedByWorkflowStmt, [workflowName], { prepare: true });
        if (lookupRows.rowLength === 0) {
            return [];
        }
        const schedulerNames = lookupRows.rows.map(row => row.get('scheduler_name'));
        const cql = `SELECT json_data FROM ${this.properties.getKeyspace()}.${CassandraSchedulerDAO.TABLE_SCHEDULES} WHERE scheduler_name IN ?`;
        const rs = await this.session.execute(cql, [schedulerNames], { prepare: true });
        return rs.rows.map(row => this.fromJson<WorkflowScheduleModel>(row.get('json_data')));
    }

    async findAllByNames(names: Set<string>): Promise<Map<string, WorkflowScheduleModel>> {
        Monitors.recordDaoRequests(CassandraSchedulerDAO.DAO_NAME, "findAllByNames", "n/a", "n/a");
        if (!names || names.size === 0) {
            return new Map();
        }
        const cql = `SELECT json_data FROM ${this.properties.getKeyspace()}.${CassandraSchedulerDAO.TABLE_SCHEDULES} WHERE scheduler_name IN ?`;
        const rs = await this.session.execute(cql, [Array.from(names)], { prepare: true });
        const result = new Map<string, WorkflowScheduleModel>();
        for (const row of rs.rows) {
            const model = this.fromJson<WorkflowScheduleModel>(row.get('json_data'));
            result.set(model.name, model);
        }
        return result;
    }

    async deleteWorkflowSchedule(name: string): Promise<void> {
        Monitors.recordDaoRequests(CassandraSchedulerDAO.DAO_NAME, "deleteWorkflowSchedule", "n/a", "n/a");

        const schedRow = await this.session.execute(this.selectScheduleByNameStmt, [name], { prepare: true });
        if (schedRow.rowLength > 0) {
            const sched = this.fromJson<WorkflowScheduleModel>(schedRow.first().get('json_data'));
            if (sched.startWorkflowRequest && sched.startWorkflowRequest.name) {
                await this.session.execute(this.deleteSchedByWorkflowStmt, [sched.startWorkflowRequest.name, name], { prepare: true });
            }
        }

        const execRows = await this.session.execute(this.selectExecByScheduleStmt, [name], { prepare: true });
        if (execRows.rowLength > 0) {
            const execIds = execRows.rows.map(row => row.get('execution_id'));
            const cql = `SELECT execution_id, state FROM ${this.properties.getKeyspace()}.${CassandraSchedulerDAO.TABLE_EXECUTIONS} WHERE execution_id IN ?`;
            const stateRs = await this.session.execute(cql, [execIds], { prepare: true });
            
            const statesByExecId = new Map<string, string | null>();
            for (const r of stateRs.rows) {
                statesByExecId.set(r.get('execution_id'), r.get('state'));
            }

            const queries: Array<{query: string, params: any[]}> = [];
            for (const execId of execIds) {
                const state = statesByExecId.get(execId);
                if (state) {
                    queries.push({ query: this.deleteExecByStateStmt, params: [state, execId] });
                }
                queries.push({ query: this.deleteExecutionStmt, params: [execId] });
                queries.push({ query: this.deleteExecByScheduleStmt, params: [name, execId] });
            }
            await this.session.batch(queries, { prepare: true, logged: false });
        }
        await this.session.execute(this.deleteScheduleStmt, [name], { prepare: true });
    }

    async saveExecutionRecord(execution: WorkflowScheduleExecutionModel): Promise<void> {
        Monitors.recordDaoRequests(CassandraSchedulerDAO.DAO_NAME, "saveExecutionRecord", "n/a", "n/a");
        const execId = execution.executionId;
        const stateStr = execution.state ? execution.state.toString() : null;

        const existing = await this.session.execute(this.selectExecutionByIdStmt, [execId], { prepare: true });
        if (existing.rowLength > 0) {
            const oldState = existing.first().get('state');
            if (oldState && oldState !== stateStr) {
                await this.session.execute(this.deleteExecByStateStmt, [oldState, execId], { prepare: true });
            }
        }

        await this.session.execute(this.upsertExecutionStmt, [execId, execution.scheduleName, stateStr, this.toJson(execution)], { prepare: true });

        await this.session.execute(this.insertExecByScheduleStmt, [execution.scheduleName, execId], { prepare: true });
        if (stateStr) {
            await this.session.execute(this.insertExecByStateStmt, [stateStr, execId], { prepare: true });
        }
    }

    async readExecutionRecord(executionId: string): Promise<WorkflowScheduleExecutionModel | null> {
        Monitors.recordDaoRequests(CassandraSchedulerDAO.DAO_NAME, "readExecutionRecord", "n/a", "n/a");
        const rs = await this.session.execute(this.selectExecutionByIdStmt, [executionId], { prepare: true });
        if (rs.rowLength === 0) return null;
        return this.fromJson<WorkflowScheduleExecutionModel>(rs.first().get('json_data'));
    }

    async removeExecutionRecord(executionId: string): Promise<void> {
        Monitors.recordDaoRequests(CassandraSchedulerDAO.DAO_NAME, "removeExecutionRecord", "n/a", "n/a");
        const rs = await this.session.execute(this.selectExecutionByIdStmt, [executionId], { prepare: true });
        if (rs.rowLength > 0) {
            const exec = this.fromJson<WorkflowScheduleExecutionModel>(rs.first().get('json_data'));
            await this.session.execute(this.deleteExecByScheduleStmt, [exec.scheduleName, executionId], { prepare: true });
            if (exec.state) {
                await this.session.execute(this.deleteExecByStateStmt, [exec.state.toString(), executionId], { prepare: true });
            }
        }
        await this.session.execute(this.deleteExecutionStmt, [executionId], { prepare: true });
    }

    async getPendingExecutionRecordIds(): Promise<string[]> {
        Monitors.recordDaoRequests(CassandraSchedulerDAO.DAO_NAME, "getPendingExecutionRecordIds", "n/a", "n/a");
        const rs = await this.session.execute(this.selectExecByStateStmt, ["POLLED"], { prepare: true });
        return rs.rows.map(row => row.get('execution_id'));
    }

    async getNextRunTimeInEpoch(scheduleName: string): Promise<number> {
        Monitors.recordDaoRequests(CassandraSchedulerDAO.DAO_NAME, "getNextRunTimeInEpoch", "n/a", "n/a");
        const rs = await this.session.execute(this.selectNextRunTimeStmt, [scheduleName], { prepare: true });
        if (rs.rowLength === 0 || rs.first().get('next_run_time') === null) {
            return -1;
        }
        return Number(rs.first().get('next_run_time'));
    }

    async setNextRunTimeInEpoch(scheduleName: string, epochMillis: number): Promise<void> {
        Monitors.recordDaoRequests(CassandraSchedulerDAO.DAO_NAME, "setNextRunTimeInEpoch", "n/a", "n/a");
        await this.session.execute(this.updateNextRunTimeStmt, [epochMillis, scheduleName], { prepare: true });
    }

    async searchSchedules(workflowName?: string, scheduleName?: string, paused?: boolean, freeText?: string, start: number = 0, size: number = 10, sortOptions?: string[]): Promise<SearchResult<WorkflowScheduleModel>> {
        Monitors.recordDaoRequests(CassandraSchedulerDAO.DAO_NAME, "searchSchedules", "n/a", "n/a");
        
        const all = await this.getAllSchedules();
        const filtered = all.filter(s => {
            if (workflowName && s.startWorkflowRequest && workflowName !== s.startWorkflowRequest.name) return false;
            if (scheduleName && !s.name.includes(scheduleName)) return false;
            if (paused !== undefined && paused !== null && s.paused !== paused) return false;
            return true;
        }).sort((a, b) => a.name.localeCompare(b.name));

        const totalHits = filtered.length;
        const end = Math.min(start + size, filtered.length);
        const page = start < filtered.length ? filtered.slice(start, end) : [];
        return new SearchResult<WorkflowScheduleModel>(totalHits, page);
    }

    private toJson(value: any): string {
        try {
            return JSON.stringify(value);
        } catch (e: any) {
            throw new NonTransientException("Failed to serialize to JSON", e);
        }
    }

    private fromJson<T>(json: string): T {
        try {
            return JSON.parse(json) as T;
        } catch (e: any) {
            throw new NonTransientException("Failed to deserialize JSON", e);
        }
    }
}
