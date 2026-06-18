import DatabaseDriver from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from '@conductor/common-persistence';
import { InitialSchemaMigration } from '@conductor/common-persistence';
import { SqliteExecutionDAO, SqliteMetadataDAO, SqliteQueueDAO } from '@conductor/sqlite-persistence';
import { createApp, WorkflowService, TaskService } from '@conductor/rest';
import {
  AgentWorkerPool,
  AgentWorkflowExecutor,
  createAgentRouter,
  InProcessEventBus,
  DbKillswitch,
  ToolRegistry,
  AgentRegistry,
  CronScheduler,
  ProcessManager,
  createAgentDef
} from '@conductor/agent-runtime';
import { TelemetryService } from '@conductor/telemetry';
import cors from 'cors';
import morgan from 'morgan';

interface Config {
  port: number;
  dbPath: string;
  version: string;
  corsOrigins: string[];
  logFormat: string;
  // Telemetry (optional — disabled when keys absent)
  langfusePublicKey?: string;
  langfuseSecretKey?: string;
  langfuseBaseUrl?: string;
}

function loadConfig(): Config {
  return {
    port: parseInt(process.env.PORT ?? '8080', 10),
    dbPath: process.env.DB_PATH ?? ':memory:',
    version: process.env.CONDUCTOR_VERSION ?? '0.0.0',
    corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map(s => s.trim()),
    logFormat: process.env.LOG_FORMAT ?? 'dev',
    langfusePublicKey: process.env.LANGFUSE_PUBLIC_KEY,
    langfuseSecretKey: process.env.LANGFUSE_SECRET_KEY,
    langfuseBaseUrl: process.env.LANGFUSE_BASE_URL,
  };
}

function printBanner(cfg: Config): void {
  const border = '='.repeat(58);
  console.log(`
${border}
  Conductor server-lite
  Version : ${cfg.version}
  Port    : ${cfg.port}
  DB      : ${cfg.dbPath === ':memory:' ? 'in-memory SQLite' : cfg.dbPath}
  CORS    : ${cfg.corsOrigins.join(', ')}
${border}
`);
}

async function main(): Promise<void> {
  const cfg = loadConfig();

  printBanner(cfg);

  // -- Telemetry (initialise before anything else so spans start from boot) --
  const telemetry = new TelemetryService({
    serviceName: 'conductor-server-lite',
    langfusePublicKey: cfg.langfusePublicKey,
    langfuseSecretKey: cfg.langfuseSecretKey,
    langfuseBaseUrl: cfg.langfuseBaseUrl,
  });
  if (cfg.langfusePublicKey) {
    console.log('Telemetry: OTel -> Langfuse enabled');
  } else {
    console.log('Telemetry: disabled (set LANGFUSE_PUBLIC_KEY to enable)');
  }

  const db = new Kysely<Database>({
    dialect: new SqliteDialect({
      database: new DatabaseDriver(cfg.dbPath),
    }),
  });

  await InitialSchemaMigration.up(db as never);

  const executionDAO = new SqliteExecutionDAO(db as never);
  const metadataDAO = new SqliteMetadataDAO(db as never);
  const queueDAO = new SqliteQueueDAO(db as never);

  // Lightweight DB probe: SELECT 1 from queue table
  const dbProbe = async () => {
    await queueDAO.getSize('__probe__');
  };

  const app = createApp({ executionDAO, metadataDAO, queueDAO, pollDataDAO: metadataDAO as never, dbProbe }, cfg.version);

  // --- Agent Runtime Wiring ---
  const workflowService = new WorkflowService(executionDAO as never, metadataDAO as never, queueDAO as never);
  const taskService = new TaskService(executionDAO as never, queueDAO as never, metadataDAO as never, metadataDAO as never);

  const eventBus = new InProcessEventBus();
  const killswitch = new DbKillswitch(executionDAO as never);
  const systemTools = new ToolRegistry();
  systemTools.register({
    name: 'git_diff',
    description: 'Get the git diff for a commit',
    parameters: { commit: 'string' },
    riskLevel: 'low',
    run: async (args) => `Diff for ${args['commit']}`
  });
  systemTools.register({
    name: 'notify_slack',
    description: 'Send a notification to Slack',
    parameters: { message: 'string' },
    riskLevel: 'high',
    run: async (args) => `Sent ${args['message']} to Slack`
  });

  const agentRegistry = new AgentRegistry();
  const agentExecutor = new AgentWorkflowExecutor(taskService as never, workflowService as never);

  // Register CommitGuardLite reference agent
  agentRegistry.register(createAgentDef({
    agentId: 'commit_guard_lite',
    name: 'CommitGuardLite',
    description: 'A reference agent that reviews commits for security issues.',
    modelExecute: 'gpt-4',
    tools: [
      {
        name: 'git_diff',
        description: 'Get the git diff for a commit',
        parameters: { commit: 'string' },
        riskLevel: 'low',
        handler: 'git_diff'
      },
      {
        name: 'notify_slack',
        description: 'Send a notification to Slack',
        parameters: { message: 'string' },
        riskLevel: 'high',
        handler: 'notify_slack'
      }
    ]
  }));

  const cronScheduler = new CronScheduler({
    db: db as never,
    onFire: async (schedule) => {
      console.log(`[Cron] Firing schedule ${schedule.name} for agent ${schedule.agentId}`);
      // Create a workflow for this agent
      const def = agentRegistry.get(schedule.agentId);
      if (def) {
        agentExecutor.startWorkflow({
          name: def.name,
          version: 1,
          input: { agentId: schedule.agentId }
        });
      }
    },
    pollIntervalMs: 10000
  });
  
  // Dummy LLM for testing
  const dummyLlm = async (model: string, prompt: string) => {
    console.log(`[LLM ${model}] received prompt length ${prompt.length}`);
    return JSON.stringify({ action: 'finish', result: 'Agent executed successfully.' });
  };

  const agentWorkerPool = new AgentWorkerPool(
    taskService as never,
    workflowService as never,
    dummyLlm,
    killswitch,
    eventBus,
    systemTools,
    telemetry,
  );
  agentWorkerPool.start();
  cronScheduler.start();

  const agentRouter = createAgentRouter(
    agentRegistry,
    eventBus,
    killswitch,
    cronScheduler,
    agentExecutor as never
  );

  app.use(cors({ origin: cfg.corsOrigins }));
  app.use(morgan(cfg.logFormat));
  
  app.use('/api/agents', agentRouter);

  const server = app.listen(cfg.port, () => {
    console.log(`Listening on http://localhost:${cfg.port}`);
  });

  const processManager = new ProcessManager();
  
  processManager.register({
    name: 'http-server',
    shutdown: () => new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    })
  });

  processManager.register({
    name: 'agent-worker-pool',
    shutdown: async () => agentWorkerPool.stop()
  });

  processManager.register({
    name: 'cron-scheduler',
    shutdown: async () => cronScheduler.stop()
  });

  processManager.register({
    name: 'database',
    shutdown: async () => {
      await db.destroy();
    }
  });

  processManager.register({
    name: 'telemetry',
    shutdown: async () => {
      await telemetry.shutdown();
    }
  });

  processManager.installSignalHandlers();
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
