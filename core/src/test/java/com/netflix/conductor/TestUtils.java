package com.netflix.conductor;

import java.util.HashSet;
import java.util.Set;
import java.util.stream.Collectors;

import jakarta.validation.ConstraintViolation;

public class TestUtils {

    public static Set<String> getConstraintViolationMessages(
            Set<ConstraintViolation<?>> constraintViolations) {
        Set<String> messages = new HashSet<>(constraintViolations.size());
        messages.addAll(
                constraintViolations.stream()
                        .map(ConstraintViolation::getMessage)
                        .collect(Collectors.toList()));
        return messages;
    }
}
