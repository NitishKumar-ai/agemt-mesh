import { describe, it, expect } from 'vitest';
import { CassandraSchedulerConfiguration } from '../../../../../../../../main/typescript/org/conductoross/conductor/scheduler/cassandra/config/CassandraSchedulerConfiguration';
import { CassandraProperties } from '../../../../../../../../../../mock';
import { Client } from 'cassandra-driver';

describe('CassandraSchedulerAutoConfigurationTest', () => {
    it('testBeansRegistered_whenCassandraAndSchedulerEnabled', () => {
        const session = {} as Client;
        const props = new CassandraProperties();
        props.setKeyspace('test_keyspace');

        const config = new CassandraSchedulerConfiguration();
        
        const dao = config.cassandraSchedulerDAO(session, props);
        expect(dao).toBeDefined();

        const archivalDao = config.cassandraSchedulerArchivalDAO(session, props);
        expect(archivalDao).toBeDefined();
    });
});
