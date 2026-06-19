import { describe, it, expect } from 'vitest';
import { PostgresSchedulerConfiguration } from '../../../../../../../../main/typescript/org/conductoross/conductor/scheduler/postgres/config/PostgresSchedulerConfiguration';
import { PostgresSchedulerDAO } from '../../../../../../../../main/typescript/org/conductoross/conductor/scheduler/postgres/dao/PostgresSchedulerDAO';

describe('PostgresSchedulerAutoConfigurationSmokeTest', () => {
    it('should configure PostgresSchedulerDAO', () => {
        const config = new PostgresSchedulerConfiguration();
        const dao = config.schedulerDAO({}, {}, {});
        expect(dao).toBeInstanceOf(PostgresSchedulerDAO);
    });
});
