package org.conductoross.conductor.scheduler.mysql.config;

import org.conductoross.conductor.scheduler.mysql.dao.MySQLSchedulerDAO;

import io.orkes.conductor.dao.scheduler.SchedulerDAO;
import io.orkes.conductor.scheduler.config.AbstractSchedulerAutoConfigurationSmokeTest;

/**
 * Smoke-tests {@link MySQLSchedulerConfiguration} auto-configuration conditions.
 *
 * <p>Positive path uses a Testcontainers MySQL instance (the {@code jdbc:tc:…} URL spins up a
 * container on first use and reuses it within the JVM). Negative paths run without any DB.
 */
public class MySQLSchedulerAutoConfigurationSmokeTest
        extends AbstractSchedulerAutoConfigurationSmokeTest {

    @Override
    protected String dbTypeValue() {
        return "mysql";
    }

    @Override
    protected String datasourceUrl() {
        return "jdbc:tc:mysql:8.0:///scheduler_smoke_test";
    }

    @Override
    protected String driverClassName() {
        return "org.testcontainers.jdbc.ContainerDatabaseDriver";
    }

    @Override
    protected Class<?> persistenceAutoConfigClass() {
        return MySQLSchedulerConfiguration.class;
    }

    @Override
    protected Class<? extends SchedulerDAO> expectedDaoClass() {
        return MySQLSchedulerDAO.class;
    }
}
