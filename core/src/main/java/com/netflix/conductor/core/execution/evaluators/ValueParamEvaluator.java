package com.netflix.conductor.core.execution.evaluators;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.netflix.conductor.core.exception.TerminateWorkflowException;

@Component(ValueParamEvaluator.NAME)
public class ValueParamEvaluator implements Evaluator {

    public static final String NAME = "value-param";
    private static final Logger LOGGER = LoggerFactory.getLogger(ValueParamEvaluator.class);

    @SuppressWarnings("unchecked")
    @Override
    public Object evaluate(String expression, Object input) {
        LOGGER.debug("ValueParam evaluator -- evaluating: {}", expression);
        if (input instanceof Map) {
            Object result = ((Map<String, Object>) input).get(expression);
            LOGGER.debug("ValueParam evaluator -- result: {}", result);
            return result;
        } else {
            String errorMsg = String.format("Input has to be a JSON object: %s", input.getClass());
            LOGGER.error(errorMsg);
            throw new TerminateWorkflowException(errorMsg);
        }
    }
}
