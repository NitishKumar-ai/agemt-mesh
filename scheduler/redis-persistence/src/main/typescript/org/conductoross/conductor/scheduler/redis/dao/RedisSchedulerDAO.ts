import { SearchResult } from '../../../../../../com/netflix/conductor/common/run/SearchResult';
import { ConductorProperties } from '../../../../../../com/netflix/conductor/core/config/ConductorProperties';
import { Monitors } from '../../../../../../com/netflix/conductor/metrics/Monitors';
import { RedisProperties } from '../../../../../../com/netflix/conductor/redis/config/RedisProperties';
import { BaseDynoDAO } from '../../../../../../com/netflix/conductor/redis/dao/BaseDynoDAO';
import { JedisProxy } from '../../../../../../com/netflix/conductor/redis/jedis/JedisProxy';
import { ObjectMapper } from '../../../../../../com/fasterxml/jackson/databind/ObjectMapper';
import { SchedulerDAO } from '../../../../../../io/orkes/conductor/dao/scheduler/SchedulerDAO';
import { WorkflowScheduleExecutionModel, WorkflowScheduleExecutionModelState } from '../../../../../../io/orkes/conductor/scheduler/model/WorkflowScheduleExecutionModel';
import { WorkflowScheduleModel } from '../../../../../../io/orkes/conductor/scheduler/model/WorkflowScheduleModel';

export class RedisSchedulerDAO extends BaseDynoDAO implements SchedulerDAO {
    private static readonly log = console;
    private static readonly SCHEDULER_DEFS = "SCHEDULER.DEFS";
    private static readonly SCHEDULER_ALL = "SCHEDULER.ALL";
    private static readonly SCHEDULER_NEXT_RUN = "SCHEDULER.NEXT_RUN";
    private static readonly SCHEDULER_EXEC = "SCHEDULER.EXEC";
    private static readonly SCHEDULER_PENDING = "SCHEDULER.PENDING";
    private static readonly SCHEDULER_WF_PREFIX = "SCHEDULER.WF";
    private static readonly SCHEDULER_EXEC_SCHED_PREFIX = "SCHEDULER.EXEC_SCHED";
    private static readonly DAO_NAME = "redis";

    constructor(
        jedisProxy: JedisProxy,
        objectMapper: ObjectMapper,
        conductorProperties: ConductorProperties,
        redisProperties: RedisProperties
    ) {
        super(jedisProxy, objectMapper, conductorProperties, redisProperties);
    }

    private keyDefs(): string { return this.nsKey(RedisSchedulerDAO.SCHEDULER_DEFS); }
    private keyAll(): string { return this.nsKey(RedisSchedulerDAO.SCHEDULER_ALL); }
    private keyNextRun(): string { return this.nsKey(RedisSchedulerDAO.SCHEDULER_NEXT_RUN); }
    private keyExec(): string { return this.nsKey(RedisSchedulerDAO.SCHEDULER_EXEC); }
    private keyPending(): string { return this.nsKey(RedisSchedulerDAO.SCHEDULER_PENDING); }
    private wfIndexKey(workflowName: string): string { return this.nsKey(RedisSchedulerDAO.SCHEDULER_WF_PREFIX, workflowName); }
    private execSchedKey(scheduleName: string): string { return this.nsKey(RedisSchedulerDAO.SCHEDULER_EXEC_SCHED_PREFIX, scheduleName); }

    public updateSchedule(schedule: WorkflowScheduleModel): void {
        Monitors.recordDaoRequests(RedisSchedulerDAO.DAO_NAME, "updateSchedule", "n/a", "n/a");
        const name = schedule.getName();

        const oldJson = this.jedisProxy.hget(this.keyDefs(), name);
        if (oldJson != null) {
            const old = this.readValue(oldJson, WorkflowScheduleModel);
            if (old.getStartWorkflowRequest() != null) {
                const oldWfName = old.getStartWorkflowRequest().getName();
                const newWfName = schedule.getStartWorkflowRequest() != null
                    ? schedule.getStartWorkflowRequest().getName()
                    : null;
                if (oldWfName != null && oldWfName !== newWfName) {
                    this.jedisProxy.srem(this.wfIndexKey(oldWfName), name);
                }
            }
        }

        this.jedisProxy.hset(this.keyDefs(), name, this.toJson(schedule));
        this.jedisProxy.sadd(this.keyAll(), name);

        if (schedule.getStartWorkflowRequest() != null && schedule.getStartWorkflowRequest().getName() != null) {
            this.jedisProxy.sadd(this.wfIndexKey(schedule.getStartWorkflowRequest().getName()), name);
        }

        if (schedule.getNextRunTime() != null) {
            this.jedisProxy.hset(this.keyNextRun(), name, String(schedule.getNextRunTime()));
        } else {
            this.jedisProxy.hdel(this.keyNextRun(), name);
        }
    }

    public findScheduleByName(name: string): WorkflowScheduleModel | null {
        Monitors.recordDaoRequests(RedisSchedulerDAO.DAO_NAME, "findScheduleByName", "n/a", "n/a");
        const json = this.jedisProxy.hget(this.keyDefs(), name);
        return json == null ? null : this.readValue(json, WorkflowScheduleModel);
    }

    public getAllSchedules(): WorkflowScheduleModel[] {
        Monitors.recordDaoRequests(RedisSchedulerDAO.DAO_NAME, "getAllSchedules", "n/a", "n/a");
        const all = this.jedisProxy.hgetAll(this.keyDefs());
        return Object.values(all).map(json => this.readValue(json as string, WorkflowScheduleModel));
    }

    public findAllSchedules(workflowName: string): WorkflowScheduleModel[] {
        Monitors.recordDaoRequests(RedisSchedulerDAO.DAO_NAME, "findAllSchedules", "n/a", "n/a");
        const names = this.jedisProxy.smembers(this.wfIndexKey(workflowName));
        if (!names || names.length === 0) {
            return [];
        }
        const result: WorkflowScheduleModel[] = [];
        for (const name of names) {
            const json = this.jedisProxy.hget(this.keyDefs(), name);
            if (json != null) {
                result.push(this.readValue(json, WorkflowScheduleModel));
            }
        }
        return result;
    }

    public findAllByNames(names: Set<string>): Map<string, WorkflowScheduleModel> {
        Monitors.recordDaoRequests(RedisSchedulerDAO.DAO_NAME, "findAllByNames", "n/a", "n/a");
        if (!names || names.size === 0) {
            return new Map();
        }
        const result = new Map<string, WorkflowScheduleModel>();
        for (const name of names) {
            const json = this.jedisProxy.hget(this.keyDefs(), name);
            if (json != null) {
                result.set(name, this.readValue(json, WorkflowScheduleModel));
            }
        }
        return result;
    }

    public deleteWorkflowSchedule(name: string): void {
        Monitors.recordDaoRequests(RedisSchedulerDAO.DAO_NAME, "deleteWorkflowSchedule", "n/a", "n/a");

        const json = this.jedisProxy.hget(this.keyDefs(), name);
        if (json != null) {
            const schedule = this.readValue(json, WorkflowScheduleModel);
            if (schedule.getStartWorkflowRequest() != null && schedule.getStartWorkflowRequest().getName() != null) {
                this.jedisProxy.srem(this.wfIndexKey(schedule.getStartWorkflowRequest().getName()), name);
            }
        }

        const execIds = this.jedisProxy.smembers(this.execSchedKey(name));
        if (execIds != null) {
            for (const execId of execIds) {
                this.jedisProxy.hdel(this.keyExec(), execId);
                this.jedisProxy.srem(this.keyPending(), execId);
            }
        }
        this.jedisProxy.del(this.execSchedKey(name));

        this.jedisProxy.hdel(this.keyDefs(), name);
        this.jedisProxy.srem(this.keyAll(), name);
        this.jedisProxy.hdel(this.keyNextRun(), name);
    }

    public saveExecutionRecord(execution: WorkflowScheduleExecutionModel): void {
        Monitors.recordDaoRequests(RedisSchedulerDAO.DAO_NAME, "saveExecutionRecord", "n/a", "n/a");
        const execId = execution.getExecutionId();
        this.jedisProxy.hset(this.keyExec(), execId, this.toJson(execution));
        this.jedisProxy.sadd(this.execSchedKey(execution.getScheduleName()), execId);

        if (execution.getState() === WorkflowScheduleExecutionModelState.POLLED) {
            this.jedisProxy.sadd(this.keyPending(), execId);
        } else {
            this.jedisProxy.srem(this.keyPending(), execId);
        }
    }

    public readExecutionRecord(executionId: string): WorkflowScheduleExecutionModel | null {
        Monitors.recordDaoRequests(RedisSchedulerDAO.DAO_NAME, "readExecutionRecord", "n/a", "n/a");
        const json = this.jedisProxy.hget(this.keyExec(), executionId);
        return json == null ? null : this.readValue(json, WorkflowScheduleExecutionModel);
    }

    public removeExecutionRecord(executionId: string): void {
        Monitors.recordDaoRequests(RedisSchedulerDAO.DAO_NAME, "removeExecutionRecord", "n/a", "n/a");
        const json = this.jedisProxy.hget(this.keyExec(), executionId);
        if (json != null) {
            const exec = this.readValue(json, WorkflowScheduleExecutionModel);
            this.jedisProxy.srem(this.execSchedKey(exec.getScheduleName()), executionId);
        }
        this.jedisProxy.hdel(this.keyExec(), executionId);
        this.jedisProxy.srem(this.keyPending(), executionId);
    }

    public getPendingExecutionRecordIds(): string[] {
        Monitors.recordDaoRequests(RedisSchedulerDAO.DAO_NAME, "getPendingExecutionRecordIds", "n/a", "n/a");
        const pending = this.jedisProxy.smembers(this.keyPending());
        return pending == null ? [] : Array.from(pending);
    }

    public getNextRunTimeInEpoch(scheduleName: string): number {
        Monitors.recordDaoRequests(RedisSchedulerDAO.DAO_NAME, "getNextRunTimeInEpoch", "n/a", "n/a");
        const val = this.jedisProxy.hget(this.keyNextRun(), scheduleName);
        if (val == null) {
            return -1;
        }
        return parseInt(val, 10);
    }

    public setNextRunTimeInEpoch(scheduleName: string, epochMillis: number): void {
        Monitors.recordDaoRequests(RedisSchedulerDAO.DAO_NAME, "setNextRunTimeInEpoch", "n/a", "n/a");
        this.jedisProxy.hset(this.keyNextRun(), scheduleName, String(epochMillis));
    }

    public searchSchedules(
        workflowName: string,
        scheduleName: string,
        paused: boolean | null,
        freeText: string,
        start: number,
        size: number,
        sortOptions: string[]
    ): SearchResult<WorkflowScheduleModel> {
        Monitors.recordDaoRequests(RedisSchedulerDAO.DAO_NAME, "searchSchedules", "n/a", "n/a");
        const all = this.getAllSchedules();
        const filtered = all.filter(s => {
            if (workflowName != null && workflowName.length > 0
                && s.getStartWorkflowRequest() != null
                && workflowName !== s.getStartWorkflowRequest().getName()) {
                return false;
            }
            if (scheduleName != null && scheduleName.length > 0 && !s.getName().includes(scheduleName)) {
                return false;
            }
            if (paused != null && s.isPaused() !== paused) {
                return false;
            }
            return true;
        }).sort((a, b) => a.getName().localeCompare(b.getName()));

        const totalHits = filtered.length;
        const end = Math.min(start + size, filtered.length);
        const page = start < filtered.length ? filtered.slice(start, end) : [];
        return new SearchResult<WorkflowScheduleModel>(totalHits, page);
    }
}
