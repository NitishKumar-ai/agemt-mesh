import { CassandraSchedulerArchivalDAO } from '../dao/CassandraSchedulerArchivalDAO';
import { CassandraSchedulerDAO } from '../dao/CassandraSchedulerDAO';
import { CassandraProperties } from '../../../../../../../../../../mock';
import { Client } from 'cassandra-driver';
import { SchedulerArchivalDAO } from '../../../../../../../../../../core/src/main/typescript/io/orkes/conductor/dao/archive/SchedulerArchivalDAO';
import { SchedulerDAO } from '../../../../../../../../../../core/src/main/typescript/io/orkes/conductor/dao/scheduler/SchedulerDAO';

export class CassandraSchedulerConfiguration {
    public cassandraSchedulerDAO(
        session: Client,
        properties: CassandraProperties
    ): SchedulerDAO {
        return new CassandraSchedulerDAO(session, properties);
    }

    public cassandraSchedulerArchivalDAO(
        session: Client,
        properties: CassandraProperties
    ): SchedulerArchivalDAO {
        return new CassandraSchedulerArchivalDAO(session, properties);
    }
}
