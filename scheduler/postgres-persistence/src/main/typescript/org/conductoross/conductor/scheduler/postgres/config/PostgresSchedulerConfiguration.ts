import { PostgresSchedulerDAO } from '../dao/PostgresSchedulerDAO';
import { PostgresSchedulerArchivalDAO } from '../dao/PostgresSchedulerArchivalDAO';

export class PostgresSchedulerConfiguration {

    flywayForScheduler(dataSource: any): any {
        return {
            locations: "classpath:db/migration_scheduler",
            dataSource: dataSource,
            table: "flyway_schema_history_scheduler",
            outOfOrder: true,
            baselineOnMigrate: true,
            baselineVersion: "0"
        };
    }

    schedulerDAO(retryTemplate: any, dataSource: any, objectMapper: any): PostgresSchedulerDAO {
        return new PostgresSchedulerDAO(retryTemplate, objectMapper, dataSource);
    }

    schedulerArchivalDAO(retryTemplate: any, dataSource: any, objectMapper: any): PostgresSchedulerArchivalDAO {
        return new PostgresSchedulerArchivalDAO(retryTemplate, objectMapper, dataSource);
    }
}
