import { Module, DynamicModule, Global } from '@nestjs/common';
import { RestModule } from '@conductor/rest';

export interface AppModuleOptions {
  executionDAO: any;
  metadataDAO: any;
  queueDAO: any;
  pollDataDAO: any;
  version: string;
  dbProbe?: () => Promise<void>;
  startTime: number;
}

@Global()
@Module({})
export class AppModule {
  static register(options: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [RestModule.forRoot()],
      providers: [
        { provide: 'EXECUTION_DAO', useValue: options.executionDAO },
        { provide: 'METADATA_DAO', useValue: options.metadataDAO },
        { provide: 'QUEUE_DAO', useValue: options.queueDAO },
        { provide: 'POLL_DATA_DAO', useValue: options.pollDataDAO },
        { provide: 'VERSION', useValue: options.version },
        { provide: 'START_TIME', useValue: options.startTime },
        { provide: 'DB_PROBE', useValue: options.dbProbe },
      ],
      exports: [
        'EXECUTION_DAO',
        'METADATA_DAO',
        'QUEUE_DAO',
        'POLL_DATA_DAO',
        'VERSION',
        'START_TIME',
        'DB_PROBE',
      ],
    };
  }
}
