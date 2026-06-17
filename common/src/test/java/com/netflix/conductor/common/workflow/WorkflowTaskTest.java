package com.netflix.conductor.common.workflow;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.junit.Test;

import com.netflix.conductor.common.metadata.tasks.TaskType;
import com.netflix.conductor.common.metadata.workflow.WorkflowTask;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

public class WorkflowTaskTest {

    @Test
    public void test() {
        WorkflowTask workflowTask = new WorkflowTask();
        workflowTask.setWorkflowTaskType(TaskType.DECISION);

        assertNotNull(workflowTask.getType());
        assertEquals(TaskType.DECISION.name(), workflowTask.getType());

        workflowTask = new WorkflowTask();
        workflowTask.setWorkflowTaskType(TaskType.SWITCH);

        assertNotNull(workflowTask.getType());
        assertEquals(TaskType.SWITCH.name(), workflowTask.getType());
    }

    @Test
    public void testOptional() {
        WorkflowTask task = new WorkflowTask();
        assertFalse(task.isOptional());

        task.setOptional(Boolean.FALSE);
        assertFalse(task.isOptional());

        task.setOptional(Boolean.TRUE);
        assertTrue(task.isOptional());
    }

    @Test
    public void testWorkflowTaskName() {
        WorkflowTask taskDef = new WorkflowTask(); // name is null
        ValidatorFactory factory = Validation.buildDefaultValidatorFactory();
        Validator validator = factory.getValidator();
        Set<ConstraintViolation<Object>> result = validator.validate(taskDef);
        assertEquals(2, result.size());

        List<String> validationErrors = new ArrayList<>();
        result.forEach(e -> validationErrors.add(e.getMessage()));

        assertTrue(validationErrors.contains("WorkflowTask name cannot be empty or null"));
        assertTrue(
                validationErrors.contains(
                        "WorkflowTask taskReferenceName name cannot be empty or null"));
    }
}
