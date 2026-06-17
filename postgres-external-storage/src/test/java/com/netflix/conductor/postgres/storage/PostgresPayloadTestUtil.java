package com.netflix.conductor.postgres.storage;

import java.nio.file.Paths;
import java.util.Map;

import javax.sql.DataSource;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.configuration.FluentConfiguration;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.testcontainers.containers.PostgreSQLContainer;

import com.netflix.conductor.postgres.config.PostgresPayloadProperties;

public class PostgresPayloadTestUtil {

    private final DataSource dataSource;
    private final PostgresPayloadProperties properties = new PostgresPayloadProperties();

    public PostgresPayloadTestUtil(PostgreSQLContainer<?> postgreSQLContainer) {

        this.dataSource =
                DataSourceBuilder.create()
                        .url(postgreSQLContainer.getJdbcUrl())
                        .username(postgreSQLContainer.getUsername())
                        .password(postgreSQLContainer.getPassword())
                        .build();
        flywayMigrate(dataSource);
    }

    private void flywayMigrate(DataSource dataSource) {
        FluentConfiguration fluentConfiguration =
                Flyway.configure()
                        .schemas("external")
                        .locations(Paths.get("db/migration_external_postgres").toString())
                        .dataSource(dataSource)
                        .placeholderReplacement(true)
                        .placeholders(
                                Map.of(
                                        "tableName",
                                        "external.external_payload",
                                        "maxDataRows",
                                        "5",
                                        "maxDataDays",
                                        "'1'",
                                        "maxDataMonths",
                                        "'1'",
                                        "maxDataYears",
                                        "'1'"));

        Flyway flyway = fluentConfiguration.load();
        flyway.migrate();
    }

    public DataSource getDataSource() {
        return dataSource;
    }

    public PostgresPayloadProperties getTestProperties() {
        return properties;
    }
}
