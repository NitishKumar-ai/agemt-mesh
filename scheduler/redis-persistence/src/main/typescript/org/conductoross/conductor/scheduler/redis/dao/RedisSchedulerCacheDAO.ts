import { ConductorProperties } from '../../../../../../com/netflix/conductor/core/config/ConductorProperties';
import { RedisProperties } from '../../../../../../com/netflix/conductor/redis/config/RedisProperties';
import { BaseDynoDAO } from '../../../../../../com/netflix/conductor/redis/dao/BaseDynoDAO';
import { JedisProxy } from '../../../../../../com/netflix/conductor/redis/jedis/JedisProxy';
import { ObjectMapper } from '../../../../../../com/fasterxml/jackson/databind/ObjectMapper';
import { SchedulerCacheDAO } from '../../../../../../io/orkes/conductor/dao/scheduler/SchedulerCacheDAO';
import { WorkflowScheduleModel } from '../../../../../../io/orkes/conductor/scheduler/model/WorkflowScheduleModel';

export class RedisSchedulerCacheDAO extends BaseDynoDAO implements SchedulerCacheDAO {
    private static readonly ALL_WORKFLOW_SCHEDULES = "WORKFLOW_SCHEDULES";
    private static readonly WORKFLOW_SCHEDULES_RUNTIME = "WORKFLOW_SCHEDULES_RUNTIME";

    constructor(
        jedisProxy: JedisProxy,
        objectMapper: ObjectMapper,
        conductorProperties: ConductorProperties,
        redisProperties: RedisProperties
    ) {
        super(jedisProxy, objectMapper, conductorProperties, redisProperties);
    }

    public updateSchedule(workflowSchedule: WorkflowScheduleModel): void {
        this.jedisProxy.hset(
            this.nsKey(RedisSchedulerCacheDAO.ALL_WORKFLOW_SCHEDULES),
            workflowSchedule.getName(),
            this.toJson(workflowSchedule)
        );
    }

    public findScheduleByName(name: string): WorkflowScheduleModel | null {
        const json = this.jedisProxy.hget(this.nsKey(RedisSchedulerCacheDAO.ALL_WORKFLOW_SCHEDULES), name);
        if (json == null) {
            return null;
        }
        return this.readValue(json, WorkflowScheduleModel);
    }

    public exists(name: string): boolean {
        return this.jedisProxy.hget(this.nsKey(RedisSchedulerCacheDAO.ALL_WORKFLOW_SCHEDULES), name) != null;
    }

    public deleteWorkflowSchedule(name: string): void {
        this.jedisProxy.hdel(this.nsKey(RedisSchedulerCacheDAO.ALL_WORKFLOW_SCHEDULES), name);
    }

    public getNextRunTimeInEpoch(scheduleName: string): number {
        const value = this.jedisProxy.get(this.nsKey(RedisSchedulerCacheDAO.WORKFLOW_SCHEDULES_RUNTIME, scheduleName));
        if (!value || value.trim() === '') {
            return -1;
        }
        return parseInt(value, 10);
    }

    public setNextRunTimeInEpoch(scheduleName: string, epochMilli: number): void {
        this.jedisProxy.set(this.nsKey(RedisSchedulerCacheDAO.WORKFLOW_SCHEDULES_RUNTIME, scheduleName), epochMilli.toString());
    }
}
