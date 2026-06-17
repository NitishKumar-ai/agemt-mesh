package org.conductoross.conductor.os2.dao.query.parser.internal;

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
