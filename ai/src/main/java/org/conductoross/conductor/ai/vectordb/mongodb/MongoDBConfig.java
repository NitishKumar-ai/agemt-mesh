package org.conductoross.conductor.ai.vectordb.mongodb;

import org.conductoross.conductor.ai.vectordb.VectorDBConfig;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class MongoDBConfig implements VectorDBConfig<MongoVectorDB> {

    private String connectionString;

    private String database;

    private String collection;

    private Integer numCandidates;

    @Override
    public MongoVectorDB get() {
        throw new UnsupportedOperationException("Use get(String name) instead");
    }

    public MongoVectorDB get(String name) {
        return new MongoVectorDB(name, this);
    }
}
