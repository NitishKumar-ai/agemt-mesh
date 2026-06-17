package com.netflix.conductor.core.execution.evaluators;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.netflix.conductor.core.events.ScriptEvaluator;

/**
 * GraalJS evaluator - an alias for JavaScript evaluator using GraalJS engine. This allows explicit
 * specification of "graaljs" as the evaluator type while maintaining backward compatibility with
 * "javascript".
 */
@Component(GraalJSEvaluator.NAME)
public class GraalJSEvaluator implements Evaluator {

    public static final String NAME = "graaljs";
    private static final Logger LOGGER = LoggerFactory.getLogger(GraalJSEvaluator.class);

    @Override
    public Object evaluate(String expression, Object input) {
        LOGGER.debug("GraalJS evaluator -- expression: {}", expression);
        Object inputCopy = ScriptEvaluator.deepCopy(input);
        Object result = ScriptEvaluator.eval(expression, inputCopy);
        LOGGER.debug("GraalJS evaluator -- result: {}", result);
        return result;
    }
}
