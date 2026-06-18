import { afterAll, afterEach, beforeAll, beforeEach, describe } from 'vitest';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { execSync } from 'child_process';

import type { Database } from '@agentmesh/common-persistence';
import { InitialSchemaMigration } from '@agentmesh/common-persistence';
import { runQueueDAOContractTests } from '../../common-persistence/test/QueueDAO.contract.js';
import { runMetadataDAOContractTests } from '../../common-persistence/test/MetadataDAO.contract.js';
import { runExecutionDAOContractTests } from '../../common-persistence/test/ExecutionDAO.contract.js';
import { runPollDataDAOContractTests } from '../../common-persistence/test/PollDataDAO.contract.js';
import { runConcurrentExecutionLimitDAOContractTests } from '../../common-persistence/test/ConcurrentExecutionLimitDAO.contract.js';
import { runRateLimitingDAOContractTests } from '../../common-persistence/test/RateLimitingDAO.contract.js';

import { PostgresQueueDAO } from '../src/PostgresQueueDAO.js';
import { PostgresMetadataDAO } from '../src/PostgresMetadataDAO.js';
import { PostgresExecutionDAO } from '../src/PostgresExecutionDAO.js';
import { PostgresPollDataDAO } from '../src/PostgresPollDataDAO.js';
import { PostgresConcurrentExecutionLimitDAO } from '../src/PostgresConcurrentExecutionLimitDAO.js';
import { PostgresRateLimitingDAO } from '../src/PostgresRateLimitingDAO.js';

describe('Postgres DAOs Integration', () => {
  let db: Kysely<Database>;

  beforeAll(async () => {
    // 1. Clean up any existing test container
    try {
      execSync('docker rm -f agent-mesh-pg-test', { stdio: 'ignore' });
    } catch {
      // ignore
    }

    // 2. Start a fresh Postgres test container
    execSync(
      'docker run -d --name agent-mesh-pg-test -p 54321:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=agent_mesh postgres:15-alpine',
    );

    // 3. Wait for database to be ready
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        execSync('docker exec agent-mesh-pg-test pg_isready', { stdio: 'ignore' });
        ready = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    if (!ready) {
      throw new Error('Postgres container did not become ready');
    }

    // 4. Initialize Kysely
    db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new pg.Pool({
          host: 'localhost',
          port: 54321,
          database: 'agent_mesh',
          user: 'postgres',
          password: 'postgres',
        }),
      }),
    });

    // 5. Apply migrations
    await InitialSchemaMigration.up(db);
  }, 30000); // 30s timeout to allow container start

  afterAll(async () => {
    if (db) {
      await db.destroy();
    }
    try {
      execSync('docker rm -f agent-mesh-pg-test', { stdio: 'ignore' });
    } catch {
      // ignore
    }
  });

  const clearAllTables = async () => {
    const tables = [
      'queue_message',
      'queue',
      'workflow_to_task',
      'workflow_pending',
      'workflow_def_to_workflow',
      'workflow',
      'task',
      'task_in_progress',
      'task_scheduled',
      'task_log',
      'poll_data',
      'event_execution',
      'meta_workflow_def',
      'meta_task_def',
      'meta_event_handler',
    ];
    for (const table of tables) {
      await db.deleteFrom(table as any).execute();
    }
  };

  runQueueDAOContractTests(async () => new PostgresQueueDAO(db), clearAllTables);

  runMetadataDAOContractTests(async () => new PostgresMetadataDAO(db), clearAllTables);

  runExecutionDAOContractTests(async () => new PostgresExecutionDAO(db), clearAllTables);

  runPollDataDAOContractTests(async () => new PostgresPollDataDAO(db), clearAllTables);

  runConcurrentExecutionLimitDAOContractTests(
    async () => new PostgresConcurrentExecutionLimitDAO(db),
    async (taskDefName, taskId, workflowId, inProgress) => {
      await db
        .insertInto('task_in_progress')
        .values({
          task_def_name: taskDefName,
          task_id: taskId,
          workflow_id: workflowId,
          in_progress_status: inProgress,
        })
        .execute();
    },
    clearAllTables,
  );

  runRateLimitingDAOContractTests(async () => new PostgresRateLimitingDAO(db), clearAllTables);
});
