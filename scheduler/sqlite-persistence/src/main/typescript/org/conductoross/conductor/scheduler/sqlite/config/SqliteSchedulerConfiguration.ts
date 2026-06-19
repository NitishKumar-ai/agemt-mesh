import { SqliteSchedulerArchivalDAO } from '../dao/SqliteSchedulerArchivalDAO';
import { SqliteSchedulerDAO } from '../dao/SqliteSchedulerDAO';

/**
 * Auto-configuration for SQLite-backed SchedulerDAO and SchedulerArchivalDAO.
 * 
 * Active when database type is 'sqlite' and scheduler is enabled.
 */
export class SqliteSchedulerConfiguration {
    public static createSchedulerDAO(db: any): SqliteSchedulerDAO {
        return new SqliteSchedulerDAO(db);
    }

    public static createSchedulerArchivalDAO(db: any): SqliteSchedulerArchivalDAO {
        return new SqliteSchedulerArchivalDAO(db);
    }
}
