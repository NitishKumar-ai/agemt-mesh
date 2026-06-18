import express from 'express';
import type { MetadataDAO, ExecutionDAO, QueueDAO, PollDataDAO } from '@conductor/common-persistence';
import { MetadataService } from './services/MetadataService.js';
import { WorkflowService } from './services/WorkflowService.js';
import { TaskService } from './services/TaskService.js';
import { EventService } from './services/EventService.js';
import { VersionService } from './services/VersionService.js';
import { AdminService } from './services/AdminService.js';
import { WorkflowBulkService } from './services/WorkflowBulkService.js';
import { createHealthRouter, type DbProbe } from './routes/health.js';
import { createMetadataRouter } from './routes/metadata.js';
import { createWorkflowRouter } from './routes/workflow.js';
import { createTaskRouter } from './routes/tasks.js';
import { createEventRouter } from './routes/event.js';
import { createVersionRouter } from './routes/version.js';
import { createAdminRouter } from './routes/admin.js';
import { createWorkflowBulkRouter } from './routes/workflowBulk.js';
import { errorHandler } from './routes/errorHandler.js';

export interface AppDependencies {
  metadataDAO: MetadataDAO;
  executionDAO: ExecutionDAO;
  queueDAO: QueueDAO;
  pollDataDAO: PollDataDAO;
  /** Optional lightweight DB liveness probe used by the /health endpoint. */
  dbProbe?: DbProbe;
}

export function createApp(deps: AppDependencies, version = '0.0.0'): express.Application {
  const app = express();

  app.use(express.json());

  const metadataService = new MetadataService(deps.metadataDAO);
  const workflowService = new WorkflowService(deps.executionDAO, deps.metadataDAO, deps.queueDAO);
  const taskService = new TaskService(deps.executionDAO, deps.queueDAO, deps.metadataDAO, deps.pollDataDAO);
  const eventService = new EventService(deps.metadataDAO);
  const versionService = new VersionService(version);
  const adminService = new AdminService(workflowService, deps.executionDAO);
  const bulkService = new WorkflowBulkService(workflowService);

  app.use('/', createHealthRouter(version, deps.dbProbe));
  app.use('/api', createWorkflowBulkRouter(bulkService));
  app.use('/api', createWorkflowRouter(workflowService));
  app.use('/api', createMetadataRouter(metadataService));
  app.use('/api', createTaskRouter(taskService));
  app.use('/api', createEventRouter(eventService));
  app.use('/api', createVersionRouter(versionService));
  app.use('/api', createAdminRouter(adminService));

  app.use(errorHandler);

  return app;
}