import { describe, it, expect } from 'vitest';
import { RedisSchedulerConfiguration } from '../../../../../../../../main/typescript/org/conductoross/conductor/scheduler/redis/config/RedisSchedulerConfiguration';

describe('RedisSchedulerAutoConfigurationTest', () => {
    it('should configure DAOs', () => {
        const config = new RedisSchedulerConfiguration();
        const mockJedisProxy = {} as any;
        const mockObjectMapper = {} as any;
        const mockConductorProps = {} as any;
        const mockRedisProps = {} as any;

        const cacheDao = config.redisSchedulerCacheDAO(mockJedisProxy, mockObjectMapper, mockConductorProps, mockRedisProps);
        const schedulerDao = config.redisSchedulerDAO(mockJedisProxy, mockObjectMapper, mockConductorProps, mockRedisProps);
        const archivalDao = config.redisSchedulerArchivalDAO(mockJedisProxy, mockObjectMapper, mockConductorProps, mockRedisProps, 7);

        expect(cacheDao).toBeDefined();
        expect(schedulerDao).toBeDefined();
        expect(archivalDao).toBeDefined();
    });
});
