package org.conductoross.conductor.scheduler.sqlite.config;

import javax.sql.DataSource;

import org.conductoross.conductor.scheduler.sqlite.dao.SqliteSchedulerArchivalDAO;
import org.conductoross.conductor.scheduler.sqlite.dao.SqliteSchedulerDAO;
import org.flywaydb.core.Flyway;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.DependsOn;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.orkes.conductor.dao.archive.SchedulerArchivalDAO;
import io.orkes.conductor.dao.scheduler.SchedulerDAO;

/**
 * Spring auto-configuration that registers SQLite-backed {@link SchedulerDAO} and {@link
 * SchedulerArchivalDAO}.
 *
 * <p>Active when {@code conductor.db.type=sqlite} AND {@code conductor.scheduler.enabled=true}.
 * Runs Flyway migrations for the scheduler tables in a dedicated history table so they do not
 * conflict with the main Conductor migration history.
 */
@AutoConfiguration
@ConditionalOnExpression(
        "'${conductor.db.type:}' == 'sqlite' && '${conductor.scheduler.enabled:false}' == 'true'")
public class SqliteSchedulerConfiguration {

    @Bean(initMethod = "migrate")
    public Flyway flywayForScheduler(DataSource dataSource) {
        return Flyway.configure()
                .locations("classpath:db/migration_scheduler_sqlite")
                .dataSource(dataSource)
                .table("flyway_schema_history_scheduler")
                .outOfOrder(true)
                .baselineOnMigrate(true)
                .baselineVersion("0")
                .load();
    }

    @Bean
    @DependsOn("flywayForScheduler")
    public SchedulerDAO schedulerDAO(DataSource dataSource, ObjectMapper objectMapper) {
        return new SqliteSchedulerDAO(dataSource, objectMapper);
    }

    @Bean
    @DependsOn("flywayForScheduler")
    public SchedulerArchivalDAO schedulerArchivalDAO(
            DataSource dataSource, ObjectMapper objectMapper) {
        return new SqliteSchedulerArchivalDAO(dataSource, objectMapper);
    }
}
