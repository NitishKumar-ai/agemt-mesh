package org.conductoross.conductor.os2.dao.query.parser.internal;

/**
 * @author Viren
 */
@FunctionalInterface
public interface FunctionThrowingException<T> {

    void accept(T t) throws Exception;
}
