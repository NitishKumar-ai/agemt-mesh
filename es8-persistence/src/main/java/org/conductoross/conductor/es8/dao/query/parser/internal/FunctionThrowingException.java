package org.conductoross.conductor.es8.dao.query.parser.internal;

/**
 * @author Viren
 */
@FunctionalInterface
public interface FunctionThrowingException<T> {

    void accept(T t) throws Exception;
}
