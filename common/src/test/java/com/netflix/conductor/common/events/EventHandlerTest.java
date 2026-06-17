package com.netflix.conductor.common.events;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.junit.Test;

import com.netflix.conductor.common.metadata.events.EventHandler;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class EventHandlerTest {

    @Test
    public void testWorkflowTaskName() {
        EventHandler taskDef = new EventHandler(); // name is null

        ValidatorFactory factory = Validation.buildDefaultValidatorFactory();
        Validator validator = factory.getValidator();
        Set<ConstraintViolation<Object>> result = validator.validate(taskDef);
        assertEquals(3, result.size());

        List<String> validationErrors = new ArrayList<>();
        result.forEach(e -> validationErrors.add(e.getMessage()));

        assertTrue(validationErrors.contains("Missing event handler name"));
        assertTrue(validationErrors.contains("Missing event location"));
        assertTrue(
                validationErrors.contains(
                        "No actions specified. Please specify at-least one action"));
    }
}
