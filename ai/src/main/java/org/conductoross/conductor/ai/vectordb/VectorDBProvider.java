package org.conductoross.conductor.ai.vectordb;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

import com.netflix.conductor.sdk.workflow.executor.task.TaskContext;

import lombok.extern.slf4j.Slf4j;

/**
 * Provider for managing multiple vector database instances. Uses name-based lookup to support
 * multiple instances of the same database type.
 *
 * <p>The provider is initialized with a VectorDBInstanceConfig which contains all configured vector
 * database instances.
 */
@Component
@Slf4j
public class VectorDBProvider {

    private final Map<String, VectorDB> vectorDBs = new ConcurrentHashMap<>();

    /**
     * Initializes the provider with configured vector database instances.
     *
     * @param instanceConfig Configuration containing all vector DB instances
     */
    public VectorDBProvider(VectorDBInstanceConfig instanceConfig) {
        try {
            Map<String, VectorDB> instances = instanceConfig.getVectorDBInstances();
            vectorDBs.putAll(instances);
            log.info("Initialized VectorDBProvider with {} instances", vectorDBs.size());
            vectorDBs
                    .keySet()
                    .forEach(
                            name ->
                                    log.info(
                                            "  - {} (type: {})",
                                            name,
                                            vectorDBs.get(name).getType()));
        } catch (Exception e) {
            log.error("Failed to initialize VectorDBProvider: {}", e.getMessage(), e);
        }
    }

    /**
     * Retrieves a vector database instance by its configured name.
     *
     * @param name The name of the vector database instance as configured
     * @param taskContext The task context (reserved for future use)
     * @return The VectorDB instance, or null if not found
     */
    public VectorDB get(String name, TaskContext taskContext) {
        VectorDB db = vectorDBs.get(name);
        if (db == null) {
            log.warn(
                    "Vector DB instance not found: {}. Available instances: {}",
                    name,
                    vectorDBs.keySet());
        }
        return db;
    }
}
