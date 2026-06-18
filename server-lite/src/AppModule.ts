import { Module, DynamicModule, Global } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {
  RestModule,
  EXECUTION_DAO,
  METADATA_DAO,
  QUEUE_DAO,
  POLL_DATA_DAO,
  WORKFLOW_EXECUTOR as WORKFLOW_EXECUTOR_TOKEN,
  START_TIME,
  VERSION,
  DB_PROBE,
} from '@agentmesh/rest';
import type { WorkflowExecutor } from '@agentmesh/core';

export const WORKFLOW_EXECUTOR = WORKFLOW_EXECUTOR_TOKEN;

export interface AppModuleOptions {
  executionDAO: any;
  metadataDAO: any;
  queueDAO: any;
  pollDataDAO: any;
  version: string;
  dbProbe?: () => Promise<void>;
  startTime: number;
  workflowExecutor?: WorkflowExecutor;
}

@Global()
@Module({})
export class AppModule {
  static register(options: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        RestModule.forRoot(),
        ServeStaticModule.forRoot({
          rootPath: path.resolve(__dirname, '../../ui-next/dist'),
          exclude: ['/api/(.*)', '/swagger-ui/(.*)', '/health', '/api-docs/(.*)'],
        }),
      ],
      providers: [
        { provide: EXECUTION_DAO, useValue: options.executionDAO },
        { provide: METADATA_DAO, useValue: options.metadataDAO },
        { provide: QUEUE_DAO, useValue: options.queueDAO },
        { provide: POLL_DATA_DAO, useValue: options.pollDataDAO },
        { provide: VERSION, useValue: options.version },
        { provide: START_TIME, useValue: options.startTime },
        { provide: DB_PROBE, useValue: options.dbProbe },
        { provide: WORKFLOW_EXECUTOR, useValue: options.workflowExecutor ?? null },
      ],
      exports: [
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
