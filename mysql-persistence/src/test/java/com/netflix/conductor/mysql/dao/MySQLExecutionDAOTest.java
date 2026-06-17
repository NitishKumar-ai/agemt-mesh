package com.netflix.conductor.mysql.dao;

import java.util.List;

import org.flywaydb.core.Flyway;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit4.SpringRunner;

import com.netflix.conductor.common.config.TestObjectMapperConfiguration;
import com.netflix.conductor.common.metadata.workflow.WorkflowDef;
import com.netflix.conductor.dao.ExecutionDAO;
import com.netflix.conductor.dao.ExecutionDAOTest;
import com.netflix.conductor.model.WorkflowModel;
import com.netflix.conductor.mysql.config.MySQLConfiguration;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

@ContextConfiguration(
        classes = {
            TestObjectMapperConfiguration.class,
            MySQLConfiguration.class,
            FlywayAutoConfiguration.class
        })
@RunWith(SpringRunner.class)
@SpringBootTest(properties = "spring.flyway.clean-disabled=false")
public class MySQLExecutionDAOTest extends ExecutionDAOTest {

    @Autowired private MySQLExecutionDAO executionDAO;

    @Autowired Flyway flyway;

    // clean the database between tests.
    @Before
    public void before() {
        flyway.clean();
        flyway.migrate();
    }

    @Test
    public void testPendingByCorrelationId() {

        WorkflowDef def = new WorkflowDef();
        def.setName("pending_count_correlation_jtest");

        WorkflowModel workflow = createTestWorkflow();
        workflow.setWorkflowDefinition(def);

        generateWorkflows(workflow, 10);

        List<WorkflowModel> bycorrelationId =
                getExecutionDAO()
                        .getWorkflowsByCorrelationId(
                                "pending_count_correlation_jtest", "corr001", true);
        assertNotNull(bycorrelationId);
        assertEquals(10, bycorrelationId.size());
    }

    @Override
    public ExecutionDAO getExecutionDAO() {
        return executionDAO;
    }
}
