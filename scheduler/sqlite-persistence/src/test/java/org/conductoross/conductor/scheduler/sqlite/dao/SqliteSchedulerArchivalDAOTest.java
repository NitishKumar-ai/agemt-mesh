package org.conductoross.conductor.scheduler.sqlite.dao;

import javax.sql.DataSource;

import org.flywaydb.core.Flyway;
import org.junit.Before;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit4.SpringRunner;

import com.netflix.conductor.common.config.ObjectMapperProvider;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.orkes.conductor.dao.archive.SchedulerArchivalDAO;
import io.orkes.conductor.scheduler.dao.AbstractSchedulerArchivalDAOTest;

/**
 * Runs the full {@link AbstractSchedulerArchivalDAOTest} contract suite against an in-memory SQLite
 * database.
 */
@ContextConfiguration(
        classes = {
            DataSourceAutoConfiguration.class,
            SqliteSchedulerArchivalDAOTest.SqliteTestConfiguration.class
        })
@RunWith(SpringRunner.class)
@SpringBootTest
@TestPropertySource(
        properties = {
            "spring.datasource.url=jdbc:sqlite::memory:",
            "spring.datasource.driver-class-name=org.sqlite.JDBC"
        })
public class SqliteSchedulerArchivalDAOTest extends AbstractSchedulerArchivalDAOTest {

    @TestConfiguration
    static class SqliteTestConfiguration {

        @Bean
        public ObjectMapper objectMapper() {
            return new ObjectMapperProvider().getObjectMapper();
        }

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
        public SchedulerArchivalDAO schedulerArchivalDAO(
                DataSource dataSource, ObjectMapper objectMapper) {
            return new SqliteSchedulerArchivalDAO(dataSource, objectMapper);
        }
    }

    @Autowired private SchedulerArchivalDAO schedulerArchivalDAO;
    @Autowired private DataSource dataSource;

    @Before
    public void cleanUp() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.update("DELETE FROM workflow_scheduled_executions");
    }

    @Override
    protected SchedulerArchivalDAO archivalDao() {
        return schedulerArchivalDAO;
    }
}
