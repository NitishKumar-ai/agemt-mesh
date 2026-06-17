package com.netflix.conductor.cassandra.dao

import java.time.Duration

import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.context.ContextConfiguration
import org.testcontainers.containers.CassandraContainer
import org.testcontainers.spock.Testcontainers

import com.netflix.conductor.cassandra.config.CassandraProperties
import com.netflix.conductor.cassandra.util.Statements
import com.netflix.conductor.common.config.TestObjectMapperConfiguration

import com.datastax.driver.core.ConsistencyLevel
import com.datastax.driver.core.Session
import com.fasterxml.jackson.databind.ObjectMapper
import groovy.transform.PackageScope
import spock.lang.Shared
import spock.lang.Specification

@ContextConfiguration(classes = [TestObjectMapperConfiguration.class])
@Testcontainers
@PackageScope
abstract class CassandraSpec extends Specification {

    @Shared
    CassandraContainer cassandra = new CassandraContainer()

    @Shared
    Session session

    @Autowired
    ObjectMapper objectMapper

    CassandraProperties cassandraProperties
    Statements statements

    def setupSpec() {
        session = cassandra.cluster.newSession()
    }

    def setup() {
        String keyspaceName = "junit"
        cassandraProperties = Mock(CassandraProperties.class) {
            getKeyspace() >> keyspaceName
            getReplicationStrategy() >> "SimpleStrategy"
            getReplicationFactorKey() >> "replication_factor"
            getReplicationFactorValue() >> 1
            getReadConsistencyLevel() >> ConsistencyLevel.LOCAL_ONE
            getWriteConsistencyLevel() >> ConsistencyLevel.LOCAL_ONE
            getTaskDefCacheRefreshInterval() >> Duration.ofSeconds(60)
            getEventHandlerCacheRefreshInterval() >> Duration.ofSeconds(60)
            getEventExecutionPersistenceTtl() >> Duration.ofSeconds(5)
        }

        statements = new Statements(keyspaceName)
    }
}
