import { afterAll, beforeAll, describe } from 'vitest';
import { execSync } from 'child_process';
import { Client } from 'cassandra-driver';
import { runQueueDAOContractTests } from '../../common-persistence/test/QueueDAO.contract.js';
import { runRateLimitingDAOContractTests } from '../../common-persistence/test/RateLimitingDAO.contract.js';
import { runConcurrentExecutionLimitDAOContractTests } from '../../common-persistence/test/ConcurrentExecutionLimitDAO.contract.js';
import { CassandraQueueDAO } from '../src/CassandraQueueDAO.js';
import { CassandraRateLimitingDAO } from '../src/CassandraRateLimitingDAO.js';
import { CassandraConcurrentExecutionLimitDAO } from '../src/CassandraConcurrentExecutionLimitDAO.js';

describe('Cassandra DAOs Integration', () => {
  let client: Client;

  beforeAll(async () => {
    try {
      execSync('docker rm -f agent-mesh-cassandra-test', { stdio: 'ignore' });
    } catch { /* ignore */ }

    execSync('docker run -d --name agent-mesh-cassandra-test -p 9042:9042 cassandra:5.0');

    client = new Client({
      contactPoints: ['127.0.0.1:9042'],
      localDataCenter: 'datacenter1',
    });

    for (let i = 0; i < 60; i++) {
      try {
        await client.connect();
        await client.execute('SELECT release_version FROM system.local');
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    await client.execute(`
      CREATE KEYSPACE IF NOT EXISTS agentmesh
      WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1}
    `);
    await client.execute('USE agentmesh');

    await client.execute(`
      CREATE TABLE IF NOT EXISTS queue_messages (
        queue_name text, message_id text, payload text, priority int,
        offset_time_seconds int, deliver_on timestamp, created_on timeuuid, popped boolean,
        PRIMARY KEY (queue_name, message_id)
      )`);
    await client.execute(`
      CREATE TABLE IF NOT EXISTS queue_messages_by_time (
        queue_name text, created_on timeuuid, message_id text,
        PRIMARY KEY (queue_name, created_on)
      ) WITH CLUSTERING ORDER BY (created_on ASC)`);
    await client.execute(`
      CREATE TABLE IF NOT EXISTS rate_limit_counters (
        task_def_name text, window_start timestamp, count counter,
        PRIMARY KEY (task_def_name, window_start))`);
    await client.execute(`
      CREATE TABLE IF NOT EXISTS concurrent_execution_limits (
        task_def_name text, task_id text, workflow_id text, added_at timestamp,
        PRIMARY KEY (task_def_name, task_id))`);
  }, 180000);

  afterAll(async () => {
    if (client) await client.shutdown();
    try {
      execSync('docker rm -f agent-mesh-cassandra-test', { stdio: 'ignore' });
    } catch { /* ignore */ }
  });

  const cleanup = async () => {
    await client.execute('TRUNCATE queue_messages');
    await client.execute('TRUNCATE queue_messages_by_time');
    await client.execute('TRUNCATE rate_limit_counters');
    await client.execute('TRUNCATE concurrent_execution_limits');
  };

  runQueueDAOContractTests(async () => new CassandraQueueDAO(client), cleanup);
  runRateLimitingDAOContractTests(async () => new CassandraRateLimitingDAO(client), cleanup);
  runConcurrentExecutionLimitDAOContractTests(
    async () => new CassandraConcurrentExecutionLimitDAO(client),
    async (taskDefName, taskId, workflowId) => {
      await client.execute(
        'INSERT INTO concurrent_execution_limits (task_def_name, task_id, workflow_id, added_at) VALUES (?, ?, ?, ?)',
        [taskDefName, taskId, workflowId, new Date()],
      );
    },
    cleanup,
  );
});
