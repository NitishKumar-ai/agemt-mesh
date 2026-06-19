import { describe, it, expect, beforeEach } from 'vitest';
import { RedisSchedulerDAO } from '../../../../../../../../main/typescript/org/conductoross/conductor/scheduler/redis/dao/RedisSchedulerDAO';

describe('RedisSchedulerDAOTest', () => {
    let dao: RedisSchedulerDAO;

    beforeEach(() => {
        const jedisProxy = {
            hset: () => {},
            hget: () => null,
            hgetAll: () => ({}),
            hdel: () => {},
            sadd: () => {},
            srem: () => {},
            smembers: () => [],
            get: () => null,
            set: () => {},
            del: () => {}
        } as any;
        const objectMapper = {
            readValue: (json: string, type: any) => JSON.parse(json),
            toJson: (obj: any) => JSON.stringify(obj)
        } as any;
        
        dao = new RedisSchedulerDAO(jedisProxy, objectMapper, {} as any, {} as any);
        (dao as any).nsKey = (prefix: string, id: string = '') => `${prefix}.${id}`;
        (dao as any).toJson = (obj: any) => JSON.stringify(obj);
        (dao as any).readValue = (json: string, type: any) => JSON.parse(json);
    });

    it('testFindScheduleByName_notFound_returnsNull', () => {
        expect(dao.findScheduleByName("no-such-schedule")).toBeNull();
    });
});
