import { SearchResult } from '../../../../../../com/netflix/conductor/common/run/SearchResult';
import { ConductorProperties } from '../../../../../../com/netflix/conductor/core/config/ConductorProperties';
import { Monitors } from '../../../../../../com/netflix/conductor/metrics/Monitors';
import { RedisProperties } from '../../../../../../com/netflix/conductor/redis/config/RedisProperties';
import { BaseDynoDAO } from '../../../../../../com/netflix/conductor/redis/dao/BaseDynoDAO';
import { JedisProxy } from '../../../../../../com/netflix/conductor/redis/jedis/JedisProxy';
import { ObjectMapper } from '../../../../../../com/fasterxml/jackson/databind/ObjectMapper';
import { SchedulerArchivalDAO } from '../../../../../../io/orkes/conductor/dao/archive/SchedulerArchivalDAO';
import { SchedulerSearchQuery } from '../../../../../../io/orkes/conductor/dao/archive/SchedulerSearchQuery';
import { WorkflowScheduleExecutionModel } from '../../../../../../io/orkes/conductor/scheduler/model/WorkflowScheduleExecutionModel';

export class RedisSchedulerArchivalDAO extends BaseDynoDAO implements SchedulerArchivalDAO {
    private static readonly log = console;
    private static readonly DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;
    private static readonly DAO_NAME = "redis";
    private static readonly SCHEDULER_ARCHIVAL_PREFIX = "SCHEDULER.ARCHIVAL";
    private static readonly SCHEDULER_ARCHIVAL_SCHED_PREFIX = "SCHEDULER.ARCHIVAL_SCHED";
    private static readonly SCHEDULER_ARCHIVAL_SCHEDNAMES = "SCHEDULER.ARCHIVAL_SCHEDNAMES";

    private ttlSeconds: number;

    constructor(
        jedisProxy: JedisProxy,
        objectMapper: ObjectMapper,
        conductorProperties: ConductorProperties,
        redisProperties: RedisProperties,
        ttlSeconds: number = RedisSchedulerArchivalDAO.DEFAULT_TTL_SECONDS
    ) {
        super(jedisProxy, objectMapper, conductorProperties, redisProperties);
        this.ttlSeconds = ttlSeconds;
    }

    private archivalKey(executionId: string): string {
        return this.nsKey(RedisSchedulerArchivalDAO.SCHEDULER_ARCHIVAL_PREFIX, executionId);
    }

    private archivalSchedKey(scheduleName: string): string {
        return this.nsKey(RedisSchedulerArchivalDAO.SCHEDULER_ARCHIVAL_SCHED_PREFIX, scheduleName);
    }

    private keySchedNames(): string {
        return this.nsKey(RedisSchedulerArchivalDAO.SCHEDULER_ARCHIVAL_SCHEDNAMES);
    }

    public saveExecutionRecord(model: WorkflowScheduleExecutionModel): void {
        Monitors.recordDaoRequests(RedisSchedulerArchivalDAO.DAO_NAME, "saveArchivalRecord", "n/a", "n/a");
        const execId = model.getExecutionId();

        this.jedisProxy.setWithExpiry(this.archivalKey(execId), this.toJson(model), this.ttlSeconds);

        const score = model.getScheduledTime() != null ? model.getScheduledTime() : 0;
        this.jedisProxy.zadd(this.archivalSchedKey(model.getScheduleName()), score, execId);

        this.jedisProxy.sadd(this.keySchedNames(), model.getScheduleName());
    }

    public searchScheduledExecutions(
        query: string, freeText: string, start: number, count: number, sort: string[]
    ): SearchResult<string> {
        Monitors.recordDaoRequests(RedisSchedulerArchivalDAO.DAO_NAME, "searchScheduledExecutions", "n/a", "n/a");

        const parsed = SchedulerSearchQuery.parse(query);

        let targetScheduleNames: string[] = [];
        if (parsed.hasScheduleNames()) {
            targetScheduleNames = parsed.getScheduleNames();
        } else {
            const all = this.jedisProxy.smembers(this.keySchedNames());
            targetScheduleNames = all ? Array.from(all) : [];
        }

        let allModels: WorkflowScheduleExecutionModel[] = [];
        for (const schedName of targetScheduleNames) {
            const ids = this.jedisProxy.zrange(this.archivalSchedKey(schedName), 0, -1);
            for (const id of ids) {
                const json = this.jedisProxy.get(this.archivalKey(id));
                if (json != null) {
                    allModels.push(this.readValue(json, WorkflowScheduleExecutionModel));
                }
            }
        }

        if (parsed.hasStates()) {
            const stateSet = new Set(parsed.getStates());
            allModels = allModels.filter(m => m.getState() != null && stateSet.has(m.getState().toString()));
        }

        if (parsed.getScheduledTimeAfter() != null) {
            const after = parsed.getScheduledTimeAfter();
            allModels = allModels.filter(m => m.getScheduledTime() != null && m.getScheduledTime() > after);
        }
        if (parsed.getScheduledTimeBefore() != null) {
            const before = parsed.getScheduledTimeBefore();
            allModels = allModels.filter(m => m.getScheduledTime() != null && m.getScheduledTime() < before);
        }

        if (parsed.hasWorkflowName()) {
            const term = parsed.getWorkflowName().toLowerCase();
            allModels = allModels.filter(m => m.getWorkflowName() != null && m.getWorkflowName().toLowerCase().includes(term));
        }

        if (parsed.hasExecutionId()) {
            const execId = parsed.getExecutionId();
            allModels = allModels.filter(m => execId === m.getExecutionId());
        }

        allModels.sort((a, b) => {
            const valB = b.getScheduledTime() != null ? b.getScheduledTime() : 0;
            const valA = a.getScheduledTime() != null ? a.getScheduledTime() : 0;
            return valB - valA;
        });

        const totalHits = allModels.length;
        const end = Math.min(start + count, allModels.length);
        const startIndex = start < allModels.length ? start : allModels.length;
        const ids = allModels.slice(startIndex, end).map(m => m.getExecutionId());

        return new SearchResult<string>(totalHits, ids);
    }

    public getExecutionsByIds(executionIds: Set<string>): Map<string, WorkflowScheduleExecutionModel> {
        Monitors.recordDaoRequests(RedisSchedulerArchivalDAO.DAO_NAME, "getExecutionsByIds", "n/a", "n/a");
        if (!executionIds || executionIds.size === 0) {
            return new Map();
        }
        const result = new Map<string, WorkflowScheduleExecutionModel>();
        for (const id of executionIds) {
            const json = this.jedisProxy.get(this.archivalKey(id));
            if (json != null) {
                result.set(id, this.readValue(json, WorkflowScheduleExecutionModel));
            }
        }
        return result;
    }

    public getExecutionById(executionId: string): WorkflowScheduleExecutionModel | null {
        Monitors.recordDaoRequests(RedisSchedulerArchivalDAO.DAO_NAME, "getExecutionById", "n/a", "n/a");
        const json = this.jedisProxy.get(this.archivalKey(executionId));
        return json == null ? null : this.readValue(json, WorkflowScheduleExecutionModel);
    }

    public cleanupOldRecords(archivalMaxRecords: number, archivalMaxRecordThreshold: number): void {
        Monitors.recordDaoRequests(RedisSchedulerArchivalDAO.DAO_NAME, "cleanupOldRecords", "n/a", "n/a");
        const scheduleNames = this.jedisProxy.smembers(this.keySchedNames());
        if (!scheduleNames) {
            return;
        }

        for (const scheduleName of scheduleNames) {
            const schedKey = this.archivalSchedKey(scheduleName);

            let allIds = this.jedisProxy.zrange(schedKey, 0, -1);
            if (allIds.length > 0) {
                const keys = allIds.map((id: string) => this.archivalKey(id));
                const values = this.jedisProxy.mget(keys);
                for (let i = 0; i < allIds.length; i++) {
                    if (values[i] == null) {
                        this.jedisProxy.zrem(schedKey, allIds[i]);
                    }
                }
            }

            const count = this.jedisProxy.zcard(schedKey);
            if (count == null || count <= archivalMaxRecordThreshold) {
                continue;
            }

            allIds = this.jedisProxy.zrange(schedKey, 0, -1);
            if (allIds.length <= archivalMaxRecords) {
                continue;
            }

            const toDeleteCount = allIds.length - archivalMaxRecords;
            const toDelete = allIds.slice(0, toDeleteCount);

            for (const execId of toDelete) {
                this.jedisProxy.zrem(schedKey, execId);
                this.jedisProxy.del(this.archivalKey(execId));
            }
            RedisSchedulerArchivalDAO.log.info(
                `Cleaned up ${toDelete.length} old archival records for schedule: ${scheduleName}`
            );
        }
    }

    private filterLive(ids: string[]): string[] {
        if (ids.length === 0) {
            return [];
        }
        const keys = ids.map(id => this.archivalKey(id));
        const values = this.jedisProxy.mget(keys);
        const live: string[] = [];
        for (let i = 0; i < ids.length; i++) {
            if (values[i] != null) {
                live.push(ids[i]);
            }
        }
        return live;
    }
}
