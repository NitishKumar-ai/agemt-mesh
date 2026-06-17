package org.conductoross.conductor.ai.vectordb;

/**
 * Marker interface for vector database configuration. Implementations provide configuration for
 * specific vector database types.
 */
public interface VectorDBConfig<T extends VectorDB> {
    T get();
}
