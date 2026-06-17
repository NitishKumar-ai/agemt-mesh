package com.netflix.conductor.es7.dao.query.parser.internal;

/**
 * @author Viren
 */
@SuppressWarnings("serial")
public class ParserException extends Exception {

    public ParserException(String message) {
        super(message);
    }

    public ParserException(String message, Throwable cause) {
        super(message, cause);
    }
}
