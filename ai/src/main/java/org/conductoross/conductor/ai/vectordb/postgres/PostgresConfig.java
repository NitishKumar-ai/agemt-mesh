package org.conductoross.conductor.ai.vectordb.postgres;

import org.conductoross.conductor.ai.vectordb.VectorDBConfig;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class PostgresConfig implements VectorDBConfig<PostgresVectorDB> {

    private String datasourceURL;

    private String user;

    private String password;

    private Integer connectionPoolSize = 5;

    private Integer dimensions = 256;

    private String indexingMethod = "hnsw";

    private String distanceMetric = "l2";

    private Integer invertedListCount = 100;

    private String tablePrefix;

    @Override
    public PostgresVectorDB get() {
        throw new UnsupportedOperationException("Use get(String name) instead");
    }

    public PostgresVectorDB get(String name) {
        return new PostgresVectorDB(name, this);
    }
}
