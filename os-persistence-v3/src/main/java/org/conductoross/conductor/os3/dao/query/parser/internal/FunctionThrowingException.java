package org.conductoross.conductor.os3.dao.query.parser.internal;

/**
 * @author Viren
 */
@FunctionalInterface
public interface FunctionThrowingException<T> {

    void accept(T t) throws Exception;
}
