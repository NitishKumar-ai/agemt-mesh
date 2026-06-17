package com.netflix.conductor.es7.dao.query.parser.internal;

/**
 * @author Viren
 */
@FunctionalInterface
public interface FunctionThrowingException<T> {

    void accept(T t) throws Exception;
}
