package org.conductoross.conductor.ai.sql;

import java.util.List;

public class JDBCInput {

    public enum Type {
        PROCEDURE,
        UPDATE,
        SELECT;
    }

    private String integrationName;
    private String schemaName;
    private String connectionId;

    private String statement;

    private Type type;

    private List<String> parameters;

    private int expectedUpdateCount;

    public JDBCInput() {}

    public String getConnectionId() {
        return connectionId;
    }

    public void setConnectionId(String connectionId) {
        this.connectionId = connectionId;
    }

    public String getStatement() {
        return statement;
    }

    public void setStatement(String statement) {
        this.statement = statement;
    }

    public List<String> getParameters() {
        return parameters;
    }

    public void setParameters(List<String> parameters) {
        this.parameters = parameters;
    }

    public Type getType() {
        return type;
    }

    public void setType(Type type) {
        this.type = type;
    }

    public int getExpectedUpdateCount() {
        return expectedUpdateCount;
    }

    public void setExpectedUpdateCount(int expectedUpdateCount) {
        this.expectedUpdateCount = expectedUpdateCount;
    }

    public String getIntegrationName() {
        return integrationName;
    }

    public void setIntegrationName(String integrationName) {
        this.integrationName = integrationName;
    }

    public String getSchemaName() {
        return schemaName;
    }

    public void setSchemaName(String schemaName) {
        this.schemaName = schemaName;
    }
}
