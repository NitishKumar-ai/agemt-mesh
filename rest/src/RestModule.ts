import { Module, DynamicModule } from '@nestjs/common';
import { WorkflowResource } from './controllers/WorkflowResource.js';
import { TaskResource } from './controllers/TaskResource.js';
import { MetadataResource } from './controllers/MetadataResource.js';
import { AdminResource } from './controllers/AdminResource.js';
import { EventResource } from './controllers/EventResource.js';
import { WorkflowBulkResource } from './controllers/WorkflowBulkResource.js';
import { HealthResource, START_TIME, VERSION, DB_PROBE } from './controllers/HealthResource.js';
import { VersionResource } from './controllers/VersionResource.js';

import { WorkflowService } from './services/WorkflowService.js';
import { TaskService } from './services/TaskService.js';
import { MetadataService } from './services/MetadataService.js';
import { AdminService } from './services/AdminService.js';
import { EventService } from './services/EventService.js';
import { WorkflowBulkService } from './services/WorkflowBulkService.js';
import { VersionService } from './services/VersionService.js';

export const EXECUTION_DAO = 'EXECUTION_DAO';
export const METADATA_DAO = 'METADATA_DAO';
export const QUEUE_DAO = 'QUEUE_DAO';
export const POLL_DATA_DAO = 'POLL_DATA_DAO';
export const WORKFLOW_EXECUTOR = 'WORKFLOW_EXECUTOR';

@Module({})
export class RestModule {
  static forRoot(): DynamicModule {
    return {
      module: RestModule,
      controllers: [
        WorkflowResource,
        TaskResource,
        MetadataResource,
        AdminResource,
        EventResource,
        WorkflowBulkResource,
        HealthResource,
        VersionResource,
      ],
      providers: [
        {
          provide: MetadataService,
          useFactory: (metadataDAO) => new MetadataService(metadataDAO),
          inject: [METADATA_DAO],
        },
        {
          provide: WorkflowService,
          useFactory: (executionDAO, metadataDAO, queueDAO, workflowExecutor) =>
            new WorkflowService(executionDAO, metadataDAO, queueDAO, workflowExecutor),
          inject: [EXECUTION_DAO, METADATA_DAO, QUEUE_DAO, WORKFLOW_EXECUTOR],
        },
        {
          provide: TaskService,
          useFactory: (executionDAO, queueDAO, metadataDAO, pollDataDAO) =>
            new TaskService(executionDAO, queueDAO, metadataDAO, pollDataDAO),
          inject: [EXECUTION_DAO, QUEUE_DAO, METADATA_DAO, POLL_DATA_DAO],
        },
        {
          provide: EventService,
          useFactory: (metadataDAO) => new EventService(metadataDAO),
          inject: [METADATA_DAO],
        },
        {
          provide: VersionService,
          useFactory: (version) => new VersionService(version),
          inject: [VERSION],
        },
        {
          provide: AdminService,
          useFactory: (workflowService, executionDAO) => new AdminService(workflowService, executionDAO),
          inject: [WorkflowService, EXECUTION_DAO],
        },
        {
          provide: WorkflowBulkService,
          useFactory: (workflowService) => new WorkflowBulkService(workflowService),
          inject: [WorkflowService],
        },
      ],
      exports: [
        MetadataService,
        WorkflowService,
        TaskService,
        EventService,
        VersionService,
        AdminService,
        WorkflowBulkService,
        EXECUTION_DAO,
        METADATA_DAO,
        QUEUE_DAO,
        POLL_DATA_DAO,
        VERSION,
        START_TIME,
        DB_PROBE,
        WORKFLOW_EXECUTOR,
      ],
    };
  }
}
