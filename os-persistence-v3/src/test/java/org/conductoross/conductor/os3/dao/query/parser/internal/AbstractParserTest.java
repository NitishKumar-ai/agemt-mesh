package org.conductoross.conductor.os3.dao.query.parser.internal;

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
