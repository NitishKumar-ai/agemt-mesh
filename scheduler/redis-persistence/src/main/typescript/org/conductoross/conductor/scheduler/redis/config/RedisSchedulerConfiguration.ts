import { RedisSchedulerArchivalDAO } from '../dao/RedisSchedulerArchivalDAO';
import { RedisSchedulerCacheDAO } from '../dao/RedisSchedulerCacheDAO';
import { RedisSchedulerDAO } from '../dao/RedisSchedulerDAO';
import { ConductorProperties } from '../../../../../../com/netflix/conductor/core/config/ConductorProperties';
import { RedisProperties } from '../../../../../../com/netflix/conductor/redis/config/RedisProperties';
import { JedisProxy } from '../../../../../../com/netflix/conductor/redis/jedis/JedisProxy';
import { ObjectMapper } from '../../../../../../com/fasterxml/jackson/databind/ObjectMapper';
import { SchedulerArchivalDAO } from '../../../../../../io/orkes/conductor/dao/archive/SchedulerArchivalDAO';
import { SchedulerCacheDAO } from '../../../../../../io/orkes/conductor/dao/scheduler/SchedulerCacheDAO';
import { SchedulerDAO } from '../../../../../../io/orkes/conductor/dao/scheduler/SchedulerDAO';

export class RedisSchedulerConfiguration {
    public redisSchedulerCacheDAO(
        jedisProxy: JedisProxy,
        objectMapper: ObjectMapper,
        conductorProperties: ConductorProperties,
        redisProperties: RedisProperties
    ): SchedulerCacheDAO {
        return new RedisSchedulerCacheDAO(
            jedisProxy, objectMapper, conductorProperties, redisProperties);
    }

    public redisSchedulerDAO(
        jedisProxy: JedisProxy,
        objectMapper: ObjectMapper,
        conductorProperties: ConductorProperties,
        redisProperties: RedisProperties
    ): SchedulerDAO {
        return new RedisSchedulerDAO(
            jedisProxy, objectMapper, conductorProperties, redisProperties);
    }

    public redisSchedulerArchivalDAO(
        jedisProxy: JedisProxy,
        objectMapper: ObjectMapper,
        conductorProperties: ConductorProperties,
        redisProperties: RedisProperties,
        archivalTtlDays: number = 7
    ): SchedulerArchivalDAO {
        const ttlSeconds = archivalTtlDays * 24 * 60 * 60;
        return new RedisSchedulerArchivalDAO(
            jedisProxy, objectMapper, conductorProperties, redisProperties, ttlSeconds);
    }
}
