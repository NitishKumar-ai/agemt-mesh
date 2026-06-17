package org.conductoross.conductor.ai.models;

import java.util.Map;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

/** Request model for listing tools from an MCP server. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = false)
public class MCPListToolsRequest extends LLMWorkerInput {

    /**
     * MCP server URL.
     *
     * <p>Examples: - HTTP/SSE: "http://localhost:3000/sse" - HTTPS: "https://api.example.com/mcp"
     */
    private String mcpServer;

    /** HTTP headers for remote MCP servers (optional). Only applicable for HTTP/HTTPS transport. */
    private Map<String, String> headers;
}
