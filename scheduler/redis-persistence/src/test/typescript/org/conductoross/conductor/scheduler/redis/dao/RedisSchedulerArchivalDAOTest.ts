import { describe, it, expect, beforeEach } from 'vitest';
import { RedisSchedulerArchivalDAO } from '../../../../../../../../main/typescript/org/conductoross/conductor/scheduler/redis/dao/RedisSchedulerArchivalDAO';

describe('RedisSchedulerArchivalDAOTest', () => {
    let dao: RedisSchedulerArchivalDAO;

    beforeEach(() => {
        const jedisProxy = {
            setWithExpiry: () => {},
            zadd: () => {},
            sadd: () => {},
            smembers: () => [],
            zrange: () => [],
            get: () => null,
            mget: () => [],
            zrem: () => {},
            zcard: () => 0,
            del: () => {}
        } as any;
        
        dao = new RedisSchedulerArchivalDAO(jedisProxy, {} as any, {} as any, {} as any);
        (dao as any).nsKey = (prefix: string, id: string = '') => `${prefix}.${id}`;
        (dao as any).toJson = (obj: any) => JSON.stringify(obj);
        (dao as any).readValue = (json: string, type: any) => JSON.parse(json);
    });

    it('testGetById_notFound_returnsNull', () => {
        expect(dao.getExecutionById("no-such-id")).toBeNull();
    });
});
