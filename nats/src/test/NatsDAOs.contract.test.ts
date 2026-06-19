import { afterAll, beforeAll, describe } from 'vitest';
import { execSync } from 'child_process';
import { runQueueDAOContractTests } from '../../common-persistence/test/QueueDAO.contract.js';
import { NatsQueue } from '../src/main/typescript/NatsQueue.js';

describe('NATS DAOs Integration', () => {
  let queue: NatsQueue;

  beforeAll(async () => {
    try {
      execSync('docker rm -f agent-mesh-nats-test', { stdio: 'ignore' });
    } catch { /* ignore */ }

    execSync(
      'docker run -d --name agent-mesh-nats-test -p 4222:4222 nats:2.10-alpine -js',
    );

    // Wait for NATS to be ready
    for (let i = 0; i < 30; i++) {
      try {
        execSync('docker exec agent-mesh-nats-test nats server check', { stdio: 'ignore' });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    queue = new NatsQueue({ servers: ['nats://localhost:4222'] });
    await queue.connect();
  }, 60000);

  afterAll(async () => {
    if (queue) await queue.close();
    try {
      execSync('docker rm -f agent-mesh-nats-test', { stdio: 'ignore' });
    } catch { /* ignore */ }
  });

  const cleanup = async () => {
    const details = await queue.queuesDetail();
    for (const qName of Object.keys(details)) {
      try {
        await queue.flush(qName);
      } catch { /* ignore */ }
    }
  };

  runQueueDAOContractTests(async () => queue, cleanup);
});
