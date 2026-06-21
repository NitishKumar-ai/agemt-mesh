import DatabaseDriver from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from '@agentmesh/common-persistence';
import { InitialSchemaMigration, AgentRuntimeMigration, DashboardMigration, PermissionsMigration, IdentityMigration, ConnectionsMigration } from '@agentmesh/common-persistence';
import {
  SqliteExecutionDAO,
  SqliteMetadataDAO,
  SqliteQueueDAO,
  SqliteConnectionDAO,
} from '@agentmesh/sqlite-persistence';
import { AMQPQueueDAO } from '@agentmesh/amqp';
import { createRedisAdapter, type RedisAdapter } from '@agentmesh/redis-lock';
import { WorkflowService, TaskService, ConnectionService } from '@agentmesh/rest';
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
  createCommitGuardTools,
  createMarketingTools,
  createSchedulerTools,
  createSelfHealTools,
  createResearchTools,
  RoutineStore,
  RoutineOrchestrator,
  createRoutinesRouter,
} from '@agentmesh/agent-runtime';
import {
  LLMs,
  ModelClient,
  AIModelProvider,
  AnthropicProvider,
  GeminiProvider,
  LlmChatComplete,
  LlmGenerateEmbeddings,
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
  WaitTaskMapper,
  UserDefinedTaskMapper,
  SystemTaskWorker,
  WorkflowStatusListener,
  TaskStatusListener,
} from '@agentmesh/core';
import { TelemetryService } from '@agentmesh/telemetry';
import { SandboxSystemTask } from '@agentmesh/sandbox';
import { HttpTask } from '@agentmesh/http-task';
import { JsonJqTransform } from '@agentmesh/json-jq-task';
import {
  WorkflowEventPublisher,
  WorkflowEventListener,
} from '@agentmesh/workflow-event-listener';
import { TaskStatusListener as TaskStatusListenerImpl } from '@agentmesh/task-status-listener';
import {
  DEMO_PRINCIPAL,
  runDemoSeed,
  principalFromAuthHeader,
  demoIdentitiesWithTokens,
} from './demoSeed.js';
import { runGrowthDemoSeed } from './demoGrowthSeed.js';
import { SyncSqliteAdapter } from './SyncSqliteAdapter.js';
import * as fs from 'fs';
import * as path from 'path';

try {
  const candidates = [
    path.resolve(process.cwd(), '../.env'),   // typical: cwd = server-lite/
    path.resolve(process.cwd(), '.env'),       // if cwd = project root
  ];
  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
      let loaded = 0;
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx > 0) {
          const key = trimmed.slice(0, idx).trim();
          let value = trimmed.slice(idx + 1).trim();
          if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
          if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
          if (!process.env[key]) {
            process.env[key] = value;
            loaded++;
          }
        }
      }
      console.log(`Loaded ${loaded} env vars from ${envPath}`);
      break; // stop after first found .env
    }
  }
} catch (e) {
  // Ignore
}

import 'reflect-metadata';
import { MetadataMapperAdapter } from './MetadataMapperAdapter.js';
import { DocumentLoader, JsonSchemaValidator } from '@agentmesh/ai';
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
  // AI Provider Keys
  anthropicApiKey?: string;
  geminiApiKey?: string;
  // Sandbox Config
  e2bApiKey?: string;
  // Queue Provider Configuration
  queueProvider?: string;
  rabbitmqUrl?: string;
  // Redis (distributed lock / cache). Unset -> single-node in-process fallback.
  redisUrl?: string;
}

/**
 * Demo flags (DEMO_AUTH / DEMO_SEED) default ON outside production so the local
 * single-port app is demoable out of the box. Explicit "true"/"false" always
 * wins; in production they are off unless explicitly set to "true".
 */
function demoEnabled(flag: 'DEMO_AUTH' | 'DEMO_SEED'): boolean {
  const value = process.env[flag];
  if (value === 'true') return true;
  if (value === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

function loadConfig(): Config {
  return {
    port: parseInt(process.env.PORT ?? '8080', 10),
    // Treat an unset OR empty DB_PATH as in-memory so a stray empty env var does
    // not point better-sqlite3 at an invalid (non-existent) path.
    dbPath: process.env.DB_PATH && process.env.DB_PATH.trim() ? process.env.DB_PATH : ':memory:',
    version: process.env.AGENTMESH_VERSION ?? '0.0.0',
    corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim()),
    logFormat: process.env.LOG_FORMAT ?? 'dev',
    langfusePublicKey: process.env.LANGFUSE_PUBLIC_KEY,
    langfuseSecretKey: process.env.LANGFUSE_SECRET_KEY,
    langfuseBaseUrl: process.env.LANGFUSE_BASE_URL,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    e2bApiKey: process.env.E2B_API_KEY,
    queueProvider: process.env.QUEUE_PROVIDER,
    rabbitmqUrl: process.env.RABBITMQ_URL,
    redisUrl: process.env.REDIS_URL,
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

async function sweeperLoop(
  syncAdapter: SyncSqliteAdapter,
  sweeper: WorkflowSweeper,
  state: { running: boolean },
): Promise<void> {
  console.log('Sweeper loop started');
  while (state.running) {
    try {
      const workflowId = syncAdapter.popMessage(DECIDER_QUEUE);
      if (workflowId) {
        console.log('[Sweeper] Popped workflow ID from decider queue:', workflowId);
        await sweeper.sweep(workflowId);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (e) {
      console.error('Error in sweeper loop:', e);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  console.log('Sweeper loop stopped');
}

export async function bootstrapServer(options?: {
  barrier?: { hold(): Promise<void> };
  dbPath?: string;
  port?: number;
  installSignalHandlers?: boolean;
  trustedPrincipal?: { id: string };
}): Promise<{ app: any; close: () => Promise<void> }> {
  const cfg = loadConfig();
  if (options?.dbPath !== undefined) {
    cfg.dbPath = options.dbPath;
  }
  if (options?.port !== undefined) {
    cfg.port = options.port;
  }

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
  if (cfg.dbPath !== ':memory:') {
    sqliteDb.pragma('journal_mode = WAL');
  }
  sqliteDb.pragma('busy_timeout = 5000');
  const db = new Kysely<Database>({
    dialect: new SqliteDialect({
      database: sqliteDb,
    }),
  });

  console.log('Running migrations...');
  try {
    await InitialSchemaMigration.up(db as never);
    await AgentRuntimeMigration.up(db as never);
    await DashboardMigration.up(db as never);
    await PermissionsMigration.up(db as never);
    await IdentityMigration.up(db as never);
    await ConnectionsMigration.up(db as never);
    console.log('Migrations complete.');
  } catch (err: any) {
    console.log('Migrations skipped or failed (likely already applied):', err.message);
  }

  const executionDAO = new SqliteExecutionDAO(db as never);
  const metadataDAO = new SqliteMetadataDAO(db as never);
  const connectionDAO = new SqliteConnectionDAO(db as never);
  const connectionService = new ConnectionService(connectionDAO);
  await connectionService.migrateTokenFile();
  const { trustWorkflowService } = await import('@agentmesh/workflow-service');
  trustWorkflowService.connectionDAO = connectionDAO;
  const baseQueueDAO = new SqliteQueueDAO(db as never);
  
  // Use hybrid AMQPQueueDAO if QUEUE_PROVIDER=amqp is specified
  const queueDAO = cfg.queueProvider === 'amqp' && cfg.rabbitmqUrl
    ? new AMQPQueueDAO(baseQueueDAO, cfg.rabbitmqUrl)
    : baseQueueDAO;

  // Auto-register workflow definitions for standard agents
  const registerWorkflowDefIfNotExist = async (name: string, taskType: string) => {
    try {
      const existing = await metadataDAO.getWorkflowDef(name, 1);
      if (!existing) {
        await metadataDAO.createWorkflowDef({
          name,
          version: 1,
          tasks: [
            {
              name: taskType,
              taskReferenceName: `${taskType}_ref`,
              type: 'SIMPLE',
              inputParameters: {},
            }
          ],
          inputParameters: [],
          outputParameters: {},
          schemaVersion: 2,
        } as any);
        console.log(`[Bootstrap] Registered workflow definition for ${name}`);
      }
    } catch (err) {
      console.error(`[Bootstrap] Error registering workflow definition for ${name}:`, err);
    }
  };

  await registerWorkflowDefIfNotExist('CommitGuard', 'commit_guard_task');
  await registerWorkflowDefIfNotExist('Marketing Agent', 'marketing_task');
  await registerWorkflowDefIfNotExist('Scheduler Agent', 'scheduler_task');
  await registerWorkflowDefIfNotExist('Self-Heal Agent', 'self_heal_task');
  await registerWorkflowDefIfNotExist('Research Agent', 'research_task');


  // --- Proxies and variables for NestJS middleware registration ---
  let activeAgentExecutor: any = null;
  const lazyAgentExecutor = new Proxy({} as any, {
    get(target, prop, receiver) {
      return Reflect.get(activeAgentExecutor || target, prop, receiver);
    }
  });

  const eventBus = new InProcessEventBus();
  const killswitch = new DbKillswitch(db as never);
  const agentRegistry = new AgentRegistry();

  // Redis-backed distributed lock (REDIS_URL gated). Without it, an in-process
  // lock keeps single-node behavior identical to before.
  const redisAdapter: RedisAdapter = await createRedisAdapter(cfg.redisUrl);

  const CRON_POLL_MS = 10000;
  const cronScheduler = new CronScheduler({
    db: db as never,
    onFire: async (schedule: any) => {
      const workflowName = schedule.prompt; // workflowName is stored in prompt
      if (!workflowName) return;

      // Dedupe concurrent fires of the same due schedule across instances. The
      // bucket ties the lock to one poll window so the next due fire is allowed.
      const bucket = Math.floor(Date.now() / CRON_POLL_MS);
      const lockKey = `cron:fire:${schedule.name}:${bucket}`;
      const outcome = await redisAdapter.lock.withLock(lockKey, CRON_POLL_MS * 3, async () => {
        console.log(`[Cron] Firing schedule ${schedule.name} with workflowName ${workflowName}`);
        lazyAgentExecutor.startWorkflow({
          name: workflowName,
          version: 1,
          input: { scheduleName: schedule.name },
        });
      });
      if (!outcome.ran) {
        console.log(`[Cron] Skipped duplicate fire for ${schedule.name} (held by another instance)`);
      }
    },
    pollIntervalMs: CRON_POLL_MS,
  });

  const agentRouter = createAgentRouter(
    agentRegistry,
    eventBus,
    killswitch,
    cronScheduler,
    lazyAgentExecutor as any,
    // The agentRouter is mounted on /api/agents BEFORE Nest controllers resolve,
    // so it owns /api/agents/connections*. Hand it the real ConnectionService
    // (which implements the ConnectionStore contract) so the Connections page is
    // backed by live SQLite data instead of the empty-store stub fallbacks.
    connectionService as any
  );

  // --- Sync Engine Adapters ---
  console.log('Initializing sync adapters...');
  type SQLiteDb = {
    prepare(sql: string): {
      run(...args: unknown[]): { changes: number };
      get(...args: unknown[]): unknown;
      all(...args: unknown[]): unknown[];
    };
  };
  const syncAdapter = new SyncSqliteAdapter(sqliteDb as unknown as SQLiteDb);
  const metadataMapper = new MetadataMapperAdapter(sqliteDb as unknown as SQLiteDb);

  // --- AI Module Initialisation ---
  console.log('Initializing AI modules...');
  const aiProvider = new AIModelProvider([
    {
      get: () => new AnthropicProvider(cfg.anthropicApiKey || 'dummy-key'),
    },
    {
      get: () => new GeminiProvider(cfg.geminiApiKey || 'dummy-key'),
    },
  ]);
  const modelClient = new ModelClient(aiProvider);

  // Minimal implementations for LLMHelper requirements
  const noopLoader: DocumentLoader = {
    supports: () => false,
    download: () => new Uint8Array(),
    upload: () => 'noop',
  };
  const noopValidator: JsonSchemaValidator = {
    validate: () => [],
  };

  const llms = new LLMs([noopLoader], noopValidator, aiProvider);
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
    new LlmChatComplete(llms, modelClient, telemetry as any, budgetManager),
    new LlmGenerateEmbeddings(llms, modelClient, telemetry as any),
    new SandboxSystemTask(cfg.e2bApiKey || 'dummy-key', ['api.github.com']),
    new HttpTask(),
    new JsonJqTransform(),
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
    USER_DEFINED: new UserDefinedTaskMapper(),
  };

  const deciderService = new DeciderService({
    taskMappers,
    systemTaskRegistry: systemTaskRegistry as any,
  });

  // --- Eventing: wire WorkflowEventPublisher + listeners ---
  const workflowEventPublisher = new WorkflowEventPublisher();
  const workflowEventListener = new WorkflowEventListener(workflowEventPublisher, queueDAO, {
    includePauseResumeEvents: true,
  });
  workflowEventListener.start();

  const taskStatusListenerImpl = new TaskStatusListenerImpl(queueDAO);
  taskStatusListenerImpl.start();

  const workflowStatusListener: WorkflowStatusListener = {
    onWorkflowStartedIfEnabled: (wf) => workflowEventPublisher.publishStarted(wf as any),
    onWorkflowCompletedIfEnabled: (wf) => workflowEventPublisher.publishCompleted(wf as any),
    onWorkflowTerminatedIfEnabled: (wf) => workflowEventPublisher.publishTerminated(wf as any),
    onWorkflowFinalizedIfEnabled: () => {},
    onWorkflowPausedIfEnabled: (wf) => workflowEventPublisher.publishPaused(wf as any),
    onWorkflowResumedIfEnabled: (wf) => workflowEventPublisher.publishResumed(wf as any),
    onWorkflowRestartedIfEnabled: () => {},
    onWorkflowRetriedIfEnabled: () => {},
    onWorkflowRerunIfEnabled: () => {},
  };

  const taskStatusListener: TaskStatusListener = {
    onTaskCompletedIfEnabled: (t) =>
      taskStatusListenerImpl.emit('taskStatusChanged', { task: t as any }),
    onTaskCanceledIfEnabled: (t) =>
      taskStatusListenerImpl.emit('taskStatusChanged', { task: t as any }),
    onTaskFailedIfEnabled: (t) =>
      taskStatusListenerImpl.emit('taskStatusChanged', { task: t as any }),
    onTaskFailedWithTerminalErrorIfEnabled: (t) =>
      taskStatusListenerImpl.emit('taskStatusChanged', { task: t as any }),
    onTaskTimedOutIfEnabled: (t) =>
      taskStatusListenerImpl.emit('taskStatusChanged', { task: t as any }),
    onTaskInProgressIfEnabled: (t) =>
      taskStatusListenerImpl.emit('taskStatusChanged', { task: t as any }),
    onTaskScheduledIfEnabled: (t) =>
      taskStatusListenerImpl.emit('taskStatusChanged', { task: t as any }),
  };

  const executorOps = new WorkflowExecutorOps({
    deciderService,
    queueDAO: syncAdapter as any,
    executionDAOFacade: syncAdapter as any,
    metadataMapperService: metadataMapper,
    workflowStatusListener,
    taskStatusListener,
    systemTaskRegistry: systemTaskRegistry as any,
    executionLockService: {
      acquireLock: () => true,
      acquireLockWithLease: () => true,
      releaseLock: () => {},
      deleteLock: () => {},
    },
    properties: {
      activeWorkerLastPollTimeout: 10000,
      workflowOffsetTimeout: 1,
      lockLeaseTime: 30000,
      humanTaskPreventsDeciderQueue: false,
      maxPostponeDurationSeconds: 60,
      systemTaskPostponeThreshold: 10,
    },
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
      systemTaskPostponeThreshold: 10,
    },
    sweeperProperties: {
      sweepBatchSize: 100,
      queuePopTimeout: 1000,
    },
    systemTaskRegistry: systemTaskRegistry as any,
    executionLockService: {
      acquireLock: () => true,
      acquireLockWithLease: () => true,
      releaseLock: () => {},
      deleteLock: () => {},
    },
  });

  // Start sweeper loop
  const sweeperState = { running: true };
  console.log('Starting sweeper loop...');

  // Recover pending/running workflows
  try {
    const pendingWorkflows = await db.selectFrom('workflow_pending').select('workflow_id').execute();
    if (pendingWorkflows.length > 0) {
      console.log(`[Bootstrap] Recovering ${pendingWorkflows.length} pending workflows into DECIDER_QUEUE...`);
      for (const row of pendingWorkflows) {
        await syncAdapter.push(DECIDER_QUEUE, row.workflow_id, 0, 0);
      }
    }
  } catch (err) {
    console.error(`[Bootstrap] Error recovering workflows:`, err);
  }

  const sweeperPromise = sweeperLoop(syncAdapter, sweeper, sweeperState);

  // Start system task worker (polls queues for async system tasks: HTTP, etc.)
  const systemTaskWorker = new SystemTaskWorker({
    queueDAO: syncAdapter as any,
    workflowExecutor: executorOps as any,
    systemTaskRegistry: systemTaskRegistry as any,
    executionDAOFacade: syncAdapter as any,
    properties: {
      systemTaskWorkerPollInterval: 500,
      systemTaskWorkerThreadCount: 5,
    },
  });
  systemTaskWorker.start();
  console.log('System task worker started');

  // Lightweight DB probe: SELECT 1 from queue table
  const dbProbe = async () => {
    await queueDAO.getSize('__probe__');
  };

  const startTime = Date.now();

  console.log('Creating NestJS app...');
  const app = await NestFactory.create(
    AppModule.register({
      executionDAO: executionDAO as never,
      metadataDAO: metadataDAO as never,
      queueDAO: queueDAO as never,
      pollDataDAO: metadataDAO as never,
      version: cfg.version,
      dbProbe,
      startTime,
      workflowExecutor: executorOps as any,
      agentRouter,
      connectionService,
    }),
    {
      cors: { origin: cfg.corsOrigins },
      logger: ['log', 'error', 'warn', 'debug', 'verbose'],
      // Preserve the raw request body so inbound webhook routes can verify HMAC
      // signatures (Slack/GitHub) over the exact received bytes.
      rawBody: true,
    },
  );

  if (options?.trustedPrincipal) {
    // Identity resolution for local demo mode:
    //  - A valid Bearer token sets the verified request identity.
    //  - No token falls back to the trusted admin so the app still works.
    //  - An invalid token is left unset for the guard to reject.
    app.use((req: any, res: any, next: any) => {
      if (!req.user) {
        const auth = req.headers['authorization'];
        if (auth) {
          const fromToken = principalFromAuthHeader(auth);
          if (fromToken) req.user = fromToken;
        } else {
          req.user = options.trustedPrincipal;
        }
      }
      next();
    });
  }

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

  // Public demo route powering the UI "View as" switcher. Mounted on the
  // underlying Express app after the Nest router, so it resolves for this
  // unmatched path. Demo-gated so it never ships in production.
  if (demoEnabled('DEMO_AUTH')) {
    expressApp.get('/api/demo/identities', (_req: any, res: any) => {
      res.json({ identities: demoIdentitiesWithTokens() });
    });
  }

  // --- Agent Runtime Wiring ---
  console.log('Initializing agent runtime wiring...');
  // Resolve services from NestJS DI
  const workflowService = app.get(WorkflowService);
  const taskService = app.get(TaskService);

  const systemTools = new ToolRegistry();

  // Register tools for all agents
  for (const tool of createCommitGuardTools()) {
    systemTools.register(tool);
  }
  for (const tool of createMarketingTools()) {
    systemTools.register(tool);
  }
  for (const tool of createSchedulerTools()) {
    systemTools.register(tool);
  }
  for (const tool of createSelfHealTools()) {
    systemTools.register(tool);
  }
  for (const tool of createResearchTools()) {
    systemTools.register(tool);
  }

  const agentExecutor = new AgentWorkflowExecutor(taskService as never, workflowService as never);
  activeAgentExecutor = agentExecutor;

  // Register CommitGuard reference agent
  agentRegistry.register(
    createAgentDef({
      agentId: 'commit_guard',
      name: 'CommitGuard',
      description:
        'An autonomous security agent that clones, scans, and files issues for vulnerable code.',
      modelExecute: 'claude-3-7-sonnet-20250219',
      tools: [
        {
          name: 'git_clone',
          description: 'Clone a git repository to a temporary workspace for analysis.',
          parameters: { repo_url: 'string' },
          riskLevel: 'low',
          handler: 'git_clone',
        },
        {
          name: 'security_scan',
          description:
            'Run a suite of security scanners (SAST, secret detection) on the workspace.',
          parameters: { path: 'string' },
          riskLevel: 'medium',
          handler: 'security_scan',
        },
        {
          name: 'verify_findings',
          description: 'Verify security findings to eliminate false positives.',
          parameters: { findings: 'string' },
          riskLevel: 'low',
          handler: 'verify_findings',
        },
        {
          name: 'file_issue',
          description: 'File a security issue in the project tracking system.',
          parameters: { title: 'string', body: 'string' },
          riskLevel: 'medium',
          handler: 'file_issue',
        },
        {
          name: 'cleanup_workspace',
          description: 'Delete the temporary workspace and all sensitive scan data.',
          parameters: { path: 'string' },
          riskLevel: 'low',
          handler: 'cleanup_workspace',
        },
      ],
    }),
  );

  // Register Marketing agent
  agentRegistry.register(
    createAgentDef({
      agentId: 'marketing',
      name: 'Marketing Agent',
      description:
        'Researches findings and generates outreach content via the Research -> Write pipeline.',
      modelExecute: 'claude-3-7-sonnet-20250219',
      tools: [
        {
          name: 'research_finding',
          description: 'Research an audience and a security finding to create a research brief.',
          parameters: {
            campaign_id: 'string',
            audience: 'string',
            channel: 'string',
            finding_summary: 'string',
            evidence: 'string',
          },
          riskLevel: 'low',
          handler: 'research_finding',
        },
        {
          name: 'generate_content',
          description: 'Generate marketing content (draft) based on a research brief.',
          parameters: {
            campaign_id: 'string',
            channel: 'string',
            campaign_name: 'string',
            value_proposition: 'string',
            finding_summary: 'string',
            research_brief: 'string',
          },
          riskLevel: 'low',
          handler: 'generate_content',
        },
        {
          name: 'schedule_campaign',
          description: 'Schedule an approved campaign for delivery.',
          parameters: { campaign_id: 'string' },
          riskLevel: 'medium',
          handler: 'schedule_campaign',
        },
      ],
    }),
  );

  // Register Scheduler agent
  agentRegistry.register(
    createAgentDef({
      agentId: 'scheduler',
      name: 'Scheduler Agent',
      description: 'Runs recurring natural-language tasks on configurable intervals.',
      modelExecute: 'claude-3-7-sonnet-20250219',
      tools: [
        {
          name: 'cron_execution',
          description: 'Execute scheduler-based cron operations.',
          parameters: { schedule_id: 'string' },
          riskLevel: 'low',
          handler: 'cron_execution',
        },
        {
          name: 'self_healing',
          description: 'Trigger self-healing checks on active systems.',
          parameters: {},
          riskLevel: 'medium',
          handler: 'self_healing',
        },
      ],
    }),
  );

  // Register Self-Heal agent
  agentRegistry.register(
    createAgentDef({
      agentId: 'selfheal',
      name: 'Self-Heal Agent',
      description: 'Diagnoses failed builds from webhook events and generates fix PRs.',
      modelExecute: 'claude-3-7-sonnet-20250219',
      tools: [
        {
          name: 'build_diagnosis',
          description: 'Diagnose failed builds by reviewing build logs.',
          parameters: { build_id: 'string' },
          riskLevel: 'low',
          handler: 'build_diagnosis',
        },
        {
          name: 'patch_generation',
          description: 'Generate patch files to fix diagnosed build failures.',
          parameters: { diagnosis: 'string' },
          riskLevel: 'low',
          handler: 'patch_generation',
        },
        {
          name: 'pr_creation',
          description: 'Create a GitHub Pull Request with the generated patch.',
          parameters: { patch: 'string', repo: 'string' },
          riskLevel: 'medium',
          handler: 'pr_creation',
        },
      ],
    }),
  );

  // Register Research agent
  agentRegistry.register(
    createAgentDef({
      agentId: 'research',
      name: 'Research Agent',
      description: 'Search the web and query local knowledge base.',
      modelExecute: 'claude-3-7-sonnet-20250219',
      tools: [
        {
          name: 'web_search',
          description: 'Search the web for up-to-date information on a topic.',
          parameters: { query: 'string' },
          riskLevel: 'low',
          handler: 'web_search',
        },
        {
          name: 'rag',
          description:
            'Query the internal knowledge base for past security findings and documentation.',
          parameters: { query: 'string' },
          riskLevel: 'low',
          handler: 'rag',
        },
      ],
    }),
  );

  // cronScheduler is already initialized and started below

  // Real LLM function — falls back to stub when no API keys are configured
  const hasAiKeys = !!(cfg.anthropicApiKey || cfg.geminiApiKey);
  if (!hasAiKeys) {
    console.warn('[LLM] No ANTHROPIC_API_KEY or GEMINI_API_KEY set — agents will use stub LLM');
  }
  const agentLlm = async (model: string, prompt: string): Promise<string> => {
    if (!hasAiKeys) {
      console.log(`[LLM stub ${model}] prompt length ${prompt.length}`);
      return JSON.stringify({ thought: 'Done', tool: 'finish', args: { result: 'Agent executed successfully (stub).' } });
    }
    try {
      const fakeTask = { taskId: 'agent-llm', workflowInstanceId: 'agent' } as any;
      const response = await llms.chatComplete(fakeTask, {
        model,
        messages: [{ role: 'user', content: prompt }],
      } as any);
      const text = (response as any)?.result ?? (response as any)?.content ?? JSON.stringify(response);
      return typeof text === 'string' ? text : JSON.stringify(text);
    } catch (err) {
      console.error(`[LLM ${model}] error:`, err);
      return JSON.stringify({ thought: 'Failed', tool: 'finish', args: { result: 'LLM call failed, aborting.' } });
    }
  };

  const agentWorkerPool = new AgentWorkerPool(
    taskService as never,
    workflowService as never,
    agentLlm,
    llms as any,
    modelClient as any,
    killswitch,
    eventBus,
    systemTools,
    telemetry as any,
    budgetManager as any,
    1000,
    options?.barrier,
  );
  agentWorkerPool.start();
  cronScheduler.start();

  // --- Routines: scheduled multi-agent orchestration -------------------------
  // A routine fires a pipeline of agents and synthesises an owner-ready report.
  // Reuses the same agentLlm (real when keys are set, deterministic demo output
  // otherwise) and the in-process event bus so runs stream onto the Activity feed.
  console.log('Initializing routines orchestrator...');
  const routineStore = new RoutineStore();
  const routineOrchestrator = new RoutineOrchestrator(
    routineStore,
    agentLlm,
    eventBus as any,
    cfg.anthropicApiKey ? (process.env.MODEL_EXECUTE || 'claude-3-7-sonnet-20250219') : 'claude-3-7-sonnet-20250219',
  );
  // Mounted directly on the Express instance so it
  // is owned outside the Nest controller surface.
  expressApp.use('/api/routines', createRoutinesRouter(routineStore, routineOrchestrator));
  routineOrchestrator.start();

  console.log('Initializing NestJS app...');
  await app.init();
  app.getHttpServer();
  console.log('Starting HTTP server...');
  await app.listen(cfg.port);
  console.log(`Listening on http://localhost:${cfg.port}`);

  // Demo bootstrap: seed an in-memory company brain so the permission-aware
  // Ask/query pipeline returns real cited answers locally. On by default outside
  // production; set DEMO_SEED=false to disable.
  if (demoEnabled('DEMO_SEED')) {
    try {
      await runDemoSeed();
    } catch (err) {
      console.error('[DemoSeed] Failed to seed demo data:', err);
    }
    try {
      // Growth Memory domain pack: layers the Atlas AI campaign dataset on top
      // of the same demo tenant/identities so the founder-growth brief demos.
      await runGrowthDemoSeed();
    } catch (err) {
      console.error('[GrowthSeed] Failed to seed growth demo data:', err);
    }
    try {
      await connectionService.seedDemoConnections();
      console.log('[DemoSeed] Seeded demo connections for the Connections page.');
    } catch (err) {
      console.error('[DemoSeed] Failed to seed demo connections:', err);
    }
  }

  const processManager = new ProcessManager();

  // Registered first so it shuts down LAST (ProcessManager.shutdown() runs
  // targets in reverse/LIFO order). Every other target below may still issue
  // DB queries while stopping (in-flight queue polls, pending decider sweeps),
  // so the database connection must outlive all of them.
  processManager.register({
    name: 'database',
    shutdown: async () => {
      await db.destroy();
    },
  });

  processManager.register({
    name: 'http-server',
    shutdown: () => app.close(),
  });

  processManager.register({
    name: 'sweeper-loop',
    shutdown: async () => {
      sweeperState.running = false;
      await sweeperPromise;
    },
  });

  processManager.register({
    name: 'system-task-worker',
    shutdown: async () => systemTaskWorker.stop(),
  });

  processManager.register({
    name: 'agent-worker-pool',
    shutdown: async () => agentWorkerPool.stop(),
  });

  processManager.register({
    name: 'cron-scheduler',
    shutdown: async () => cronScheduler.stop(),
  });

  processManager.register({
    name: 'routine-orchestrator',
    shutdown: async () => routineOrchestrator.stop(),
  });

  processManager.register({
    name: 'event-listeners',
    shutdown: async () => {
      workflowEventListener.stop();
      taskStatusListenerImpl.stop();
    },
  });

  processManager.register({
    name: 'telemetry',
    shutdown: async () => {
      await telemetry.shutdown();
    },
  });

  if (options?.installSignalHandlers ?? true) {
    processManager.installSignalHandlers();
  }

  return {
    app,
    close: async () => {
      await processManager.shutdown();
      await redisAdapter.close();
    },
  };
}

if (process.env.NODE_ENV !== 'test') {
  bootstrapServer({
    // Demo affordance: install a trusted identity so the local UI can call the
    // permission-aware API without a full OAuth/OIDC login. On by default outside
    // production; set DEMO_AUTH=false to disable.
    trustedPrincipal: demoEnabled('DEMO_AUTH') ? DEMO_PRINCIPAL : undefined,
  }).catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
