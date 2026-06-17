package org.conductoross.conductor.ai.models;

import java.util.Map;

import lombok.Data;

@Data
public class ToolSpec {
    private String name;
    private String type;
    private Map<String, Object> configParams;
    private Map<String, String> integrationNames;
    private String description;
    private Map<String, Object> inputSchema;
    private Map<String, Object> outputSchema;
}
