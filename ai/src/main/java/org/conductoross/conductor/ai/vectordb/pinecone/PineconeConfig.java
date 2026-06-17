package org.conductoross.conductor.ai.vectordb.pinecone;

import org.conductoross.conductor.ai.vectordb.VectorDBConfig;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class PineconeConfig implements VectorDBConfig<PineconeDB> {

    private String apiKey;

    @Override
    public PineconeDB get() {
        throw new UnsupportedOperationException("Use get(String name) instead");
    }

    public PineconeDB get(String name) {
        return new PineconeDB(name, this);
    }
}
