import { afterAll, beforeAll, describe } from 'vitest';
import { execSync } from 'child_process';
import { Redis } from 'ioredis';
import { runQueueDAOContractTests } from '../../common-persistence/test/QueueDAO.contract.js';
import { RedisQueueDAO } from '../src/RedisQueueDAO.js';

describe('Redis DAOs Integration', () => {
  let redisClient: Redis;

  beforeAll(async () => {
    try {
      execSync('docker rm -f agent-mesh-redis-test', { stdio: 'ignore' });
    } catch { /* ignore */ }

    execSync('docker run -d --name agent-mesh-redis-test -p 6379:6379 redis:7-alpine');

    redisClient = new Redis({ host: 'localhost', port: 6379, lazyConnect: true });
    await redisClient.connect();

    for (let i = 0; i < 30; i++) {
      try {
        await redisClient.ping();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }, 60000);

  afterAll(async () => {
    if (redisClient) redisClient.disconnect();
    try {
      execSync('docker rm -f agent-mesh-redis-test', { stdio: 'ignore' });
    } catch { /* ignore */ }
  });

  const cleanup = async () => {
    await redisClient.flushall();
  };

  runQueueDAOContractTests(async () => new RedisQueueDAO(redisClient), cleanup);
});
