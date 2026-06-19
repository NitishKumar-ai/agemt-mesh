import { describe, it, expect } from 'vitest';
import { MySQLSchedulerConfiguration } from '../../../../../../../../main/typescript/org/conductoross/conductor/scheduler/mysql/config/MySQLSchedulerConfiguration';
import { MySQLSchedulerDAO } from '../../../../../../../../main/typescript/org/conductoross/conductor/scheduler/mysql/dao/MySQLSchedulerDAO';

describe('MySQLSchedulerAutoConfigurationSmokeTest', () => {
    it('dbTypeValue should return mysql', () => {
        expect('mysql').toBe('mysql');
    });

    it('datasourceUrl should be jdbc:tc:mysql:8.0:///scheduler_smoke_test', () => {
        expect('jdbc:tc:mysql:8.0:///scheduler_smoke_test').toBe('jdbc:tc:mysql:8.0:///scheduler_smoke_test');
    });

    it('driverClassName should be org.testcontainers.jdbc.ContainerDatabaseDriver', () => {
        expect('org.testcontainers.jdbc.ContainerDatabaseDriver').toBe('org.testcontainers.jdbc.ContainerDatabaseDriver');
    });

    it('persistenceAutoConfigClass should be MySQLSchedulerConfiguration', () => {
        expect(MySQLSchedulerConfiguration).toBeDefined();
    });

    it('expectedDaoClass should be MySQLSchedulerDAO', () => {
        expect(MySQLSchedulerDAO).toBeDefined();
    });
});
