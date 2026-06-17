package com.netflix.conductor.contribs.listener;

import java.util.UUID;

import org.junit.Before;
import org.junit.Test;
import org.mockito.Mockito;

import com.netflix.conductor.common.metadata.workflow.WorkflowDef;
import com.netflix.conductor.contribs.listener.archive.ArchivingWorkflowStatusListener;
import com.netflix.conductor.core.dal.ExecutionDAOFacade;
import com.netflix.conductor.model.WorkflowModel;

import static org.mockito.Mockito.*;

/**
 * @author pavel.halabala
 */
public class ArchivingWorkflowStatusListenerTest {

    WorkflowModel workflow;
    ExecutionDAOFacade executionDAOFacade;
    ArchivingWorkflowStatusListener listener;

    @Before
    public void before() {
        workflow = new WorkflowModel();
        WorkflowDef def = new WorkflowDef();
        def.setName("name1");
        def.setVersion(1);
        workflow.setWorkflowDefinition(def);
        workflow.setWorkflowId(UUID.randomUUID().toString());

        executionDAOFacade = Mockito.mock(ExecutionDAOFacade.class);
        listener = new ArchivingWorkflowStatusListener(executionDAOFacade);
    }

    @Test
    public void testArchiveOnWorkflowCompleted() {
        listener.onWorkflowCompleted(workflow);
        verify(executionDAOFacade, times(1)).removeWorkflow(workflow.getWorkflowId(), true);
        verifyNoMoreInteractions(executionDAOFacade);
    }

    @Test
    public void testArchiveOnWorkflowTerminated() {
        listener.onWorkflowTerminated(workflow);
        verify(executionDAOFacade, times(1)).removeWorkflow(workflow.getWorkflowId(), true);
        verifyNoMoreInteractions(executionDAOFacade);
    }
}
