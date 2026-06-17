package org.conductoross.conductor.scheduler.cassandra.config;

import org.conductoross.conductor.scheduler.cassandra.dao.CassandraSchedulerArchivalDAO;
import org.conductoross.conductor.scheduler.cassandra.dao.CassandraSchedulerDAO;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.netflix.conductor.cassandra.config.CassandraProperties;

import com.datastax.driver.core.Session;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.orkes.conductor.dao.archive.SchedulerArchivalDAO;
import io.orkes.conductor.dao.scheduler.SchedulerDAO;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "conductor.db.type", havingValue = "cassandra")
public class CassandraSchedulerConfiguration {

    @Bean
    @ConditionalOnProperty(
            name = "conductor.scheduler.enabled",
            havingValue = "true",
            matchIfMissing = false)
    public SchedulerDAO cassandraSchedulerDAO(
            Session session, ObjectMapper objectMapper, CassandraProperties properties) {
        return new CassandraSchedulerDAO(session, objectMapper, properties);
    }

    @Bean
    @ConditionalOnProperty(
            name = "conductor.scheduler.enabled",
            havingValue = "true",
            matchIfMissing = false)
    public SchedulerArchivalDAO cassandraSchedulerArchivalDAO(
            Session session, ObjectMapper objectMapper, CassandraProperties properties) {
        return new CassandraSchedulerArchivalDAO(session, objectMapper, properties);
    }
}
