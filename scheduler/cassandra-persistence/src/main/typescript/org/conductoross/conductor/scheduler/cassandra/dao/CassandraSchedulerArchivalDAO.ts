import { CassandraBaseDAO } from '../../../../../../../../../../mock';
import { CassandraProperties } from '../../../../../../../../../../mock';
import { SearchResult } from '../../../../../../../../../../mock';
import { NonTransientException } from '../../../../../../../../../../mock';
import { Monitors } from '../../../../../../../../../../mock';

import { Client, types } from 'cassandra-driver';
import { SchedulerArchivalDAO } from '../../../../../../../../../../core/src/main/typescript/io/orkes/conductor/dao/archive/SchedulerArchivalDAO';
import { SchedulerSearchQuery } from '../../../../../../../../../../core/src/main/typescript/io/orkes/conductor/dao/archive/SchedulerSearchQuery';
import { WorkflowScheduleExecutionModel, State } from '../../../../../../../../../../core/src/main/typescript/io/orkes/conductor/scheduler/model/WorkflowScheduleExecutionModel';
import { StartWorkflowRequest } from '../../../../../../../../../../mock';

export class CassandraSchedulerArchivalDAO extends CassandraBaseDAO implements SchedulerArchivalDAO {
    private static readonly log = console;
    private static readonly DAO_NAME = "cassandra";

    private static readonly TABLE_ARCHIVAL = "scheduler_archival_executions";
    private static readonly TABLE_ARCHIVAL_BY_ID = "scheduler_archival_by_id";

    private static readonly CLEANUP_BATCH_CHUNK_SIZE = 100;
    private static readonly FREE_TEXT_SCAN_LIMIT = 10000;

    private upsertArchivalStmt!: string;
    private upsertByIdStmt!: string;
    private selectByIdStmt!: string;
    private selectByScheduleStmt!: string;
    private deleteByScheduleAndTimeStmt!: string;
    private deleteByIdStmt!: string;
    private countByScheduleStmt!: string;

    constructor(session: Client, properties: CassandraProperties) {
        super(session, properties);
        this.prepareStatements();
    }

    public async ensureTables(): Promise<void> {
        const ks = this.properties.getKeyspace();
        await this.session.execute(`CREATE TABLE IF NOT EXISTS ${ks}.${CassandraSchedulerArchivalDAO.TABLE_ARCHIVAL} (schedule_name text, scheduled_time bigint, execution_id text, workflow_name text, workflow_id text, reason text, stack_trace text, state text, execution_time bigint, start_workflow_request text, PRIMARY KEY ((schedule_name), scheduled_time, execution_id)) WITH CLUSTERING ORDER BY (scheduled_time DESC, execution_id ASC)`);
        await this.session.execute(`CREATE TABLE IF NOT EXISTS ${ks}.${CassandraSchedulerArchivalDAO.TABLE_ARCHIVAL_BY_ID} (execution_id text PRIMARY KEY, schedule_name text, workflow_name text, workflow_id text, reason text, stack_trace text, state text, scheduled_time bigint, execution_time bigint, start_workflow_request text)`);
    }

    private prepareStatements(): void {
        const ks = this.properties.getKeyspace();
        this.upsertArchivalStmt = `INSERT INTO ${ks}.${CassandraSchedulerArchivalDAO.TABLE_ARCHIVAL} (schedule_name, scheduled_time, execution_id, workflow_name, workflow_id, reason, stack_trace, state, execution_time, start_workflow_request) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        this.upsertByIdStmt = `INSERT INTO ${ks}.${CassandraSchedulerArchivalDAO.TABLE_ARCHIVAL_BY_ID} (execution_id, schedule_name, workflow_name, workflow_id, reason, stack_trace, state, scheduled_time, execution_time, start_workflow_request) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        this.selectByIdStmt = `SELECT * FROM ${ks}.${CassandraSchedulerArchivalDAO.TABLE_ARCHIVAL_BY_ID} WHERE execution_id = ?`;
        this.selectByScheduleStmt = `SELECT * FROM ${ks}.${CassandraSchedulerArchivalDAO.TABLE_ARCHIVAL} WHERE schedule_name = ?`;
        this.deleteByScheduleAndTimeStmt = `DELETE FROM ${ks}.${CassandraSchedulerArchivalDAO.TABLE_ARCHIVAL} WHERE schedule_name = ? AND scheduled_time = ? AND execution_id = ?`;
        this.deleteByIdStmt = `DELETE FROM ${ks}.${CassandraSchedulerArchivalDAO.TABLE_ARCHIVAL_BY_ID} WHERE execution_id = ?`;
        this.countByScheduleStmt = `SELECT COUNT(*) FROM ${ks}.${CassandraSchedulerArchivalDAO.TABLE_ARCHIVAL} WHERE schedule_name = ?`;
    }

    async saveExecutionRecord(model: WorkflowScheduleExecutionModel): Promise<void> {
        Monitors.recordDaoRequests(CassandraSchedulerArchivalDAO.DAO_NAME, "saveArchivalRecord", "n/a", "n/a");
        const swrJson = this.serializeStartWorkflowRequest(model.startWorkflowRequest);
        const stateStr = model.state ? model.state.toString() : null;
        const scheduledTime = model.scheduledTime ? model.scheduledTime : 0;
        const executionTime = model.executionTime ? model.executionTime : 0;

        const queries = [
            {
                query: this.upsertArchivalStmt,
                params: [model.scheduleName, scheduledTime, model.executionId, model.workflowName, model.workflowId, model.reason, model.stackTrace, stateStr, executionTime, swrJson]
            },
            {
                query: this.upsertByIdStmt,
                params: [model.executionId, model.scheduleName, model.workflowName, model.workflowId, model.reason, model.stackTrace, stateStr, scheduledTime, executionTime, swrJson]
            }
        ];
        await this.session.batch(queries, { prepare: true, logged: true });
    }

    async searchScheduledExecutions(query: string, freeText: string, start: number, count: number, sort: string[]): Promise<SearchResult<string>> {
        Monitors.recordDaoRequests(CassandraSchedulerArchivalDAO.DAO_NAME, "searchScheduledExecutions", "n/a", "n/a");

        const parsed = SchedulerSearchQuery.parse(query);

        let targetScheduleNames: string[];
        if (parsed.hasScheduleNames()) {
            targetScheduleNames = parsed.getScheduleNames();
        } else {
            const distinctRows = await this.session.execute(`SELECT DISTINCT schedule_name FROM ${this.properties.getKeyspace()}.${CassandraSchedulerArchivalDAO.TABLE_ARCHIVAL}`, []);
            targetScheduleNames = distinctRows.rows.map(r => r.get('schedule_name'));
        }

        let allModels: WorkflowScheduleExecutionModel[] = [];
        for (const scheduleName of targetScheduleNames) {
            const rows = await this.session.execute(this.selectByScheduleStmt, [scheduleName], { prepare: true });
            for (const row of rows.rows) {
                allModels.push(this.rowToModel(row));
            }
        }

        if (parsed.hasStates()) {
            const stateSet = new Set(parsed.getStates());
            allModels = allModels.filter(m => m.state && stateSet.has(m.state.toString()));
        }

        if (parsed.getScheduledTimeAfter() !== null && parsed.getScheduledTimeAfter() !== undefined) {
            const after = parsed.getScheduledTimeAfter();
            allModels = allModels.filter(m => m.scheduledTime && m.scheduledTime > after);
        }
        if (parsed.getScheduledTimeBefore() !== null && parsed.getScheduledTimeBefore() !== undefined) {
            const before = parsed.getScheduledTimeBefore();
            allModels = allModels.filter(m => m.scheduledTime && m.scheduledTime < before);
        }

        if (parsed.hasWorkflowName()) {
            const term = parsed.getWorkflowName().toLowerCase();
            allModels = allModels.filter(m => m.workflowName && m.workflowName.toLowerCase().includes(term));
        }

        if (parsed.hasExecutionId()) {
            const execId = parsed.getExecutionId();
            allModels = allModels.filter(m => execId === m.executionId);
        }

        allModels.sort((a, b) => {
            const timeA = a.scheduledTime ? a.scheduledTime : 0;
            const timeB = b.scheduledTime ? b.scheduledTime : 0;
            return timeB - timeA; // DESC
        });

        const totalHits = allModels.length;
        const end = Math.min(start + count, allModels.length);
        const sliced = start < allModels.length ? allModels.slice(start, end) : [];
        const ids = sliced.map(m => m.executionId);

        return new SearchResult<string>(totalHits, ids);
    }

    async getExecutionsByIds(executionIds: Set<string>): Promise<Map<string, WorkflowScheduleExecutionModel>> {
        Monitors.recordDaoRequests(CassandraSchedulerArchivalDAO.DAO_NAME, "getExecutionsByIds", "n/a", "n/a");
        if (!executionIds || executionIds.size === 0) {
            return new Map();
        }
        const cql = `SELECT * FROM ${this.properties.getKeyspace()}.${CassandraSchedulerArchivalDAO.TABLE_ARCHIVAL_BY_ID} WHERE execution_id IN ?`;
        const rs = await this.session.execute(cql, [Array.from(executionIds)], { prepare: true });
        const result = new Map<string, WorkflowScheduleExecutionModel>();
        for (const row of rs.rows) {
            const model = this.rowToModel(row);
            result.set(model.executionId, model);
        }
        return result;
    }

    async getExecutionById(executionId: string): Promise<WorkflowScheduleExecutionModel | null> {
        Monitors.recordDaoRequests(CassandraSchedulerArchivalDAO.DAO_NAME, "getExecutionById", "n/a", "n/a");
        const rs = await this.session.execute(this.selectByIdStmt, [executionId], { prepare: true });
        if (rs.rowLength === 0) return null;
        return this.rowToModel(rs.first());
    }

    async cleanupOldRecords(archivalMaxRecords: number, archivalMaxRecordThreshold: number): Promise<void> {
        Monitors.recordDaoRequests(CassandraSchedulerArchivalDAO.DAO_NAME, "cleanupOldRecords", "n/a", "n/a");
        
        const allRows = await this.session.execute(`SELECT DISTINCT schedule_name FROM ${this.properties.getKeyspace()}.${CassandraSchedulerArchivalDAO.TABLE_ARCHIVAL}`, []);
        const scheduleNames = new Set(allRows.rows.map(r => r.get('schedule_name')));

        for (const scheduleName of scheduleNames) {
            const countRs = await this.session.execute(this.countByScheduleStmt, [scheduleName], { prepare: true });
            const count = Number(countRs.first().get(0));
            if (count <= archivalMaxRecordThreshold) {
                continue;
            }

            const rowsRs = await this.session.execute(this.selectByScheduleStmt, [scheduleName], { prepare: true });
            const rows = rowsRs.rows;
            if (rows.length <= archivalMaxRecords) {
                continue;
            }

            const toDelete = rows.slice(archivalMaxRecords);
            const chunkSize = CassandraSchedulerArchivalDAO.CLEANUP_BATCH_CHUNK_SIZE;
            for (let i = 0; i < toDelete.length; i += chunkSize) {
                const end = Math.min(i + chunkSize, toDelete.length);
                const queries: Array<{query: string, params: any[]}> = [];
                for (let j = i; j < end; j++) {
                    const row = toDelete[j];
                    queries.push({
                        query: this.deleteByScheduleAndTimeStmt,
                        params: [scheduleName, row.get('scheduled_time'), row.get('execution_id')]
                    });
                    queries.push({
                        query: this.deleteByIdStmt,
                        params: [row.get('execution_id')]
                    });
                }
                await this.session.batch(queries, { prepare: true, logged: false });
            }
            CassandraSchedulerArchivalDAO.log.info(`Cleaned up ${toDelete.length} old archival records for schedule: ${scheduleName}`);
        }
    }

    private rowToModel(row: types.Row): WorkflowScheduleExecutionModel {
        const model = new WorkflowScheduleExecutionModel();
        model.executionId = row.get('execution_id');
        model.scheduleName = row.get('schedule_name');
        model.workflowName = row.get('workflow_name') !== null ? row.get('workflow_name') : undefined;
        model.workflowId = row.get('workflow_id') !== null ? row.get('workflow_id') : undefined;
        model.reason = row.get('reason') !== null ? row.get('reason') : undefined;
        model.stackTrace = row.get('stack_trace') !== null ? row.get('stack_trace') : undefined;
        
        const stateStr = row.get('state');
        if (stateStr !== null && stateStr !== undefined) {
            model.state = stateStr as State;
        }
        
        const schedTime = row.get('scheduled_time');
        model.scheduledTime = schedTime !== null ? Number(schedTime) : undefined;
        
        const execTime = row.get('execution_time');
        model.executionTime = execTime !== null ? Number(execTime) : undefined;
        
        const swrStr = row.get('start_workflow_request');
        model.startWorkflowRequest = swrStr !== null ? this.deserializeStartWorkflowRequest(swrStr) : undefined;
        
        return model;
    }

    private serializeStartWorkflowRequest(request?: StartWorkflowRequest): string | null {
        if (!request) {
            return null;
        }
        try {
            return JSON.stringify(request);
        } catch (e: any) {
            throw new NonTransientException("Failed to serialize StartWorkflowRequest to JSON", e);
        }
    }

    private deserializeStartWorkflowRequest(json?: string): StartWorkflowRequest | undefined {
        if (!json || json === '') {
            return undefined;
        }
        try {
            return JSON.parse(json) as StartWorkflowRequest;
        } catch (e: any) {
            throw new NonTransientException("Failed to deserialize StartWorkflowRequest from JSON", e);
        }
    }
}
