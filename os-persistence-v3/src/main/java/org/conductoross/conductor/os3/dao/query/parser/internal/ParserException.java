package org.conductoross.conductor.os3.dao.query.parser.internal;

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
