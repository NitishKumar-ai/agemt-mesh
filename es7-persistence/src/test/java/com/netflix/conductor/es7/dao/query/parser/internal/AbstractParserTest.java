package com.netflix.conductor.es7.dao.query.parser.internal;

import java.io.BufferedInputStream;
import java.io.ByteArrayInputStream;
import java.io.InputStream;

/**
 * @author Viren
 */
public abstract class AbstractParserTest {

    protected InputStream getInputStream(String expression) {
        return new BufferedInputStream(new ByteArrayInputStream(expression.getBytes()));
    }
}
