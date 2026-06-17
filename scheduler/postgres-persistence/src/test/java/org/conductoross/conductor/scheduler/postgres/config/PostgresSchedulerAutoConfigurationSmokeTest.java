package org.conductoross.conductor.scheduler.postgres.config;

import org.conductoross.conductor.scheduler.postgres.dao.PostgresSchedulerDAO;

import io.orkes.conductor.dao.scheduler.SchedulerDAO;
import io.orkes.conductor.scheduler.config.AbstractSchedulerAutoConfigurationSmokeTest;

/**
 * Smoke-tests {@link PostgresSchedulerConfiguration} auto-configuration conditions.
 *
 * <p>Positive path uses a Testcontainers PostgreSQL instance (the {@code jdbc:tc:…} URL spins up a
 * container on first use and reuses it within the JVM). Negative paths run without any DB.
 */
public class PostgresSchedulerAutoConfigurationSmokeTest
        extends AbstractSchedulerAutoConfigurationSmokeTest {

    @Override
    protected String dbTypeValue() {
        return "postgres";
    }

    @Override
    protected String datasourceUrl() {
        return "jdbc:tc:postgresql:15-alpine:///scheduler_smoke_test";
    }

    @Override
    protected String driverClassName() {
        return "org.testcontainers.jdbc.ContainerDatabaseDriver";
    }

    @Override
    protected Class<?> persistenceAutoConfigClass() {
        return PostgresSchedulerConfiguration.class;
    }

    @Override
    protected Class<? extends SchedulerDAO> expectedDaoClass() {
        return PostgresSchedulerDAO.class;
    }
}
