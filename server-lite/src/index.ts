import DatabaseDriver from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from '@agentmesh/common-persistence';
import { InitialSchemaMigration, AgentRuntimeMigration } from '@agentmesh/common-persistence';
import { SqliteExecutionDAO, SqliteMetadataDAO, SqliteQueueDAO } from '@agentmesh/sqlite-persistence';
import { WorkflowService, TaskService } from '@agentmesh/rest';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './AppModule.js';
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
  createAgentDef,
  BudgetManager,
  createCommitGuardTools
} from '@agentmesh/agent-runtime';
import {
  LLMs,
  ModelClient,
  AIModelProvider,
  AnthropicProvider,
  GeminiProvider,
  LlmChatComplete,
  LlmGenerateEmbeddings
} from '@agentmesh/ai';
import {
  SystemTaskRegistry,
  WorkflowSweeper,
  WorkflowExecutorOps,
  DeciderService,
  DECIDER_QUEUE,
  Decision,
  DoWhile,
  Event,
  ExclusiveJoin,
  Fork,
  Human,
  Inline,
  Join,
  Lambda,
  Noop,
  SetVariable,
  StartWorkflow,
  SubWorkflow,
  Switch,
  Terminate,
  Wait,
  DoWhileTaskMapper,
  ForkJoinDynamicTaskMapper,
  ForkJoinTaskMapper,
  HumanTaskMapper,
  JoinTaskMapper,
  SimpleTaskMapper,
  SubWorkflowTaskMapper,
  SwitchTaskMapper,
  TerminateTaskMapper,
  WaitTaskMapper
} from '@agentmesh/core';
import { TelemetryService } from '@agentmesh/telemetry';
import { SandboxSystemTask } from '@agentmesh/sandbox';
import { SyncSqliteAdapter } from './SyncSqliteAdapter.js';
import { MetadataMapperAdapter } from './MetadataMapperAdapter.js';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import morgan from 'morgan';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  // AI Provider Keys
  anthropicApiKey?: string;
  geminiApiKey?: string;
  // Sandbox Config
  e2bApiKey?: string;
}

function loadConfig(): Config {
  return {
    port: parseInt(process.env.PORT ?? '8080', 10),
    dbPath: process.env.DB_PATH ?? ':memory:',
    version: process.env.AGENTMESH_VERSION ?? '0.0.0',
    corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map(s => s.trim()),
    logFormat: process.env.LOG_FORMAT ?? 'dev',
    langfusePublicKey: process.env.LANGFUSE_PUBLIC_KEY,
    langfuseSecretKey: process.env.LANGFUSE_SECRET_KEY,
    langfuseBaseUrl: process.env.LANGFUSE_BASE_URL,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    e2bApiKey: process.env.E2B_API_KEY,
  };
}

function printBanner(cfg: Config): void {
  const border = '='.repeat(58);
  console.log(`
${border}
  AgentMesh server-lite
  Version : ${cfg.version}
  Port    : ${cfg.port}
  DB      : ${cfg.dbPath === ':memory:' ? 'in-memory SQLite' : cfg.dbPath}
  CORS    : ${cfg.corsOrigins.join(', ')}
${border}
`);
}

async function sweeperLoop(syncAdapter: SyncSqliteAdapter, sweeper: WorkflowSweeper, state: { running: boolean }): Promise<void> {
  console.log('Sweeper loop started');
  while (state.running) {
    try {
      const workflowId = syncAdapter.popMessage(DECIDER_QUEUE);
      if (workflowId) {
        await sweeper.sweep(workflowId);
      } else {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (e) {
      console.error('Error in sweeper loop:', e);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  console.log('Sweeper loop stopped');
}

async function main(): Promise<void> {
  const cfg = loadConfig();

  printBanner(cfg);

  // -- Telemetry (initialise before anything else so spans start from boot) --
  const telemetry = new TelemetryService({
    serviceName: 'agentmesh-server-lite',
    langfusePublicKey: cfg.langfusePublicKey,
    langfuseSecretKey: cfg.langfuseSecretKey,
    langfuseBaseUrl: cfg.langfuseBaseUrl,
  });
  if (cfg.langfusePublicKey) {
    console.log('Telemetry: OTel -> Langfuse enabled');
  } else {
    console.log('Telemetry: disabled (set LANGFUSE_PUBLIC_KEY to enable)');
  }

  const sqliteDb = new DatabaseDriver(cfg.dbPath);
  const db = new Kysely<Database>({
    dialect: new SqliteDialect({
      database: sqliteDb,
    }),
  });

  console.log('Running migrations...');
  await InitialSchemaMigration.up(db as never);
  await AgentRuntimeMigration.up(db as never);
  console.log('Migrations complete.');

  const executionDAO = new SqliteExecutionDAO(db as never);
  const metadataDAO = new SqliteMetadataDAO(db as never);
  const queueDAO = new SqliteQueueDAO(db as never);

  // --- Sync Engine Adapters ---
  console.log('Initializing sync adapters...');
  const syncAdapter = new SyncSqliteAdapter(sqliteDb as any);
  const metadataMapper = new MetadataMapperAdapter(sqliteDb as any);

  // --- AI Module Initialisation ---
  console.log('Initializing AI modules...');
  const aiProvider = new AIModelProvider([
    {
      get: () => new AnthropicProvider(cfg.anthropicApiKey || 'dummy-key')
    },
    {
      get: () => new GeminiProvider(cfg.geminiApiKey || 'dummy-key')
    }
  ]);
  const modelClient = new ModelClient(aiProvider);
  
  // Minimal implementations for LLMHelper requirements
  const noopLoader = {
    supports: () => false,
    download: () => new Uint8Array(),
    upload: () => 'noop'
  };
  const noopValidator = {
    validate: () => []
  };

  const llms = new LLMs([noopLoader as any], noopValidator as any, aiProvider);
  const budgetManager = new BudgetManager();

  // --- AgentMesh Execution Engine Wiring ---
  console.log('Initializing execution engine wiring...');
  const systemTasks = [
    new Decision(),
    new DoWhile(),
    new Event(),
    new ExclusiveJoin(),
    new Fork(),
    new Human(),
    new Inline(),
    new Join(),
    new Lambda(),
    new Noop(),
    new SetVariable(),
    new StartWorkflow(),
    new SubWorkflow(),
    new Switch(),
    new Terminate(),
    new Wait(),
    new LlmChatComplete(llms as any, modelClient as any, telemetry as any, budgetManager as any),
    new LlmGenerateEmbeddings(llms as any, modelClient as any, telemetry as any),
    new SandboxSystemTask(cfg.e2bApiKey || 'dummy-key', ['api.github.com'])
  ];

  const systemTaskRegistry = new SystemTaskRegistry(systemTasks as any);

  const taskMappers = {
    DO_WHILE: new DoWhileTaskMapper(),
    FORK_JOIN_DYNAMIC: new ForkJoinDynamicTaskMapper(),
    FORK_JOIN: new ForkJoinTaskMapper(),
    HUMAN: new HumanTaskMapper(),
    JOIN: new JoinTaskMapper(),
    SIMPLE: new SimpleTaskMapper(),
    SUB_WORKFLOW: new SubWorkflowTaskMapper(),
    SWITCH: new SwitchTaskMapper(),
    TERMINATE: new TerminateTaskMapper(),
    WAIT: new WaitTaskMapper(),
  };

  const deciderService = new DeciderService({
    taskMappers: taskMappers as any,
    systemTaskRegistry: systemTaskRegistry as any
  });

  const executorOps = new WorkflowExecutorOps({
    deciderService: deciderService as any,
    queueDAO: syncAdapter as any,
    executionDAOFacade: syncAdapter as any,
    metadataMapperService: metadataMapper as any,
    workflowStatusListener: {
      onWorkflowStartedIfEnabled: () => {},
      onWorkflowCompletedIfEnabled: () => {},
      onWorkflowTerminatedIfEnabled: () => {},
      onWorkflowFinalizedIfEnabled: () => {},
      onWorkflowPausedIfEnabled: () => {},
      onWorkflowResumedIfEnabled: () => {},
      onWorkflowRestartedIfEnabled: () => {},
      onWorkflowRetriedIfEnabled: () => {},
      onWorkflowRerunIfEnabled: () => {}
    } as any,
    taskStatusListener: {
      onTaskCompletedIfEnabled: () => {},
      onTaskCanceledIfEnabled: () => {},
      onTaskFailedIfEnabled: () => {},
      onTaskFailedWithTerminalErrorIfEnabled: () => {},
      onTaskTimedOutIfEnabled: () => {},
      onTaskInProgressIfEnabled: () => {},
      onTaskScheduledIfEnabled: () => {}
    } as any,
    systemTaskRegistry: systemTaskRegistry as any,
    executionLockService: {
      acquireLock: () => true,
      acquireLockWithLease: () => true,
      releaseLock: () => {},
      deleteLock: () => {}
    } as any,
    properties: {
      activeWorkerLastPollTimeout: 10000,
      workflowOffsetTimeout: 1,
      lockLeaseTime: 30000,
      humanTaskPreventsDeciderQueue: false,
      maxPostponeDurationSeconds: 60,
      systemTaskPostponeThreshold: 10
    }
  });

  const sweeper = new WorkflowSweeper({
    queueDAO: syncAdapter as any,
    workflowExecutor: executorOps as any,
    executionDAO: syncAdapter as any,
    properties: {
      activeWorkerLastPollTimeout: 10000,
      workflowOffsetTimeout: 1,
      lockLeaseTime: 30000,
      humanTaskPreventsDeciderQueue: false,
      maxPostponeDurationSeconds: 60,
      systemTaskPostponeThreshold: 10
    },
    sweeperProperties: {
      sweepBatchSize: 100,
      queuePopTimeout: 1000
    },
    systemTaskRegistry: systemTaskRegistry as any,
    executionLockService: {
      acquireLock: () => true,
      acquireLockWithLease: () => true,
      releaseLock: () => {},
      deleteLock: () => {}
    } as any
  });

  // Start sweeper loop
  const sweeperState = { running: true };
  console.log('Starting sweeper loop...');
  const sweeperPromise = sweeperLoop(syncAdapter, sweeper, sweeperState);

  // Lightweight DB probe: SELECT 1 from queue table
  const dbProbe = async () => {
    await queueDAO.getSize('__probe__');
  };

  const startTime = Date.now();
  
  console.log('Creating NestJS app...');
  const app = await NestFactory.create(AppModule.register({
    executionDAO: executionDAO as never,
    metadataDAO: metadataDAO as never,
    queueDAO: queueDAO as never,
    pollDataDAO: metadataDAO as never,
    version: cfg.version,
    dbProbe,
    startTime,
    workflowExecutor: executorOps as any
  }), { cors: { origin: cfg.corsOrigins }, logger: ['log', 'error', 'warn', 'debug', 'verbose'] });

  // OpenAPI/Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('AgentMesh API')
    .setDescription('The AgentMesh server-lite API')
    .setVersion(cfg.version)
    .addTag('workflows')
    .addTag('tasks')
    .addTag('metadata')
    .addTag('admin')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use(morgan(cfg.logFormat));
  expressApp.use(express.static(path.join(__dirname, '..', 'public')));

  // --- Agent Runtime Wiring ---
  console.log('Initializing agent runtime wiring...');
  // Resolve services from NestJS DI
  const workflowService = app.get(WorkflowService);
  const taskService = app.get(TaskService);

  const eventBus = new InProcessEventBus();
  const killswitch = new DbKillswitch(db as never);
  const systemTools = new ToolRegistry();
  
  // Register CommitGuard tools
  for (const tool of createCommitGuardTools()) {
    systemTools.register(tool);
  }

  const agentRegistry = new AgentRegistry();
  const agentExecutor = new AgentWorkflowExecutor(taskService as never, workflowService as never);

  // Register CommitGuard reference agent
  agentRegistry.register(createAgentDef({
    agentId: 'commit_guard',
    name: 'CommitGuard',
    description: 'An autonomous security agent that clones, scans, and files issues for vulnerable code.',
    modelExecute: 'claude-3-7-sonnet-20250219',
    tools: [
      {
        name: 'git_clone',
        description: 'Clone a git repository to a temporary workspace for analysis.',
        parameters: { repo_url: 'string' },
        riskLevel: 'low',
        handler: 'git_clone'
      },
      {
        name: 'security_scan',
        description: 'Run a suite of security scanners (SAST, secret detection) on the workspace.',
        parameters: { path: 'string' },
        riskLevel: 'medium',
        handler: 'security_scan'
      },
      {
        name: 'verify_findings',
        description: 'Verify security findings to eliminate false positives.',
        parameters: { findings: 'string' },
        riskLevel: 'low',
        handler: 'verify_findings'
      },
      {
        name: 'file_issue',
        description: 'File a security issue in the project tracking system.',
        parameters: { title: 'string', body: 'string' },
        riskLevel: 'medium',
        handler: 'file_issue'
      },
      {
        name: 'cleanup_workspace',
        description: 'Delete the temporary workspace and all sensitive scan data.',
        parameters: { path: 'string' },
        riskLevel: 'low',
        handler: 'cleanup_workspace'
      }
    ]
  }));

  const cronScheduler = new CronScheduler({
    db: db as never,
    onFire: async (schedule: any) => {
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
    llms as any,
    modelClient as any,
    killswitch,
    eventBus,
    systemTools,
    telemetry as any,
    budgetManager as any
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

  expressApp.use('/api/agents', agentRouter);

  console.log('Initializing NestJS app...');
  await app.init();
  const server = app.getHttpServer();
  console.log('Starting HTTP server...');
  await app.listen(cfg.port);
  console.log(`Listening on http://localhost:${cfg.port}`);

  const processManager = new ProcessManager();
  
  processManager.register({
    name: 'http-server',
    shutdown: () => app.close()
  });

  processManager.register({
    name: 'sweeper-loop',
    shutdown: async () => {
      sweeperState.running = false;
      await sweeperPromise;
    }
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
