package org.conductoross.conductor.ai.models;

import java.util.HashMap;
import java.util.Map;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

/**
 * Request model for calling a tool on an MCP server.
 *
 * <p>All fields except mcpServer, toolName, and headers are treated as tool arguments and passed to
 * the MCP tool.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = false)
public class MCPToolCallRequest extends LLMWorkerInput {

    /**
     * MCP server URL.
     *
     * <p>Examples: - HTTP/SSE: "http://localhost:3000/sse" - HTTPS: "https://api.example.com/mcp"
     */
    private String mcpServer;

    /** Name of the tool to call on the MCP server. */
    private String method;

    /** HTTP headers for remote MCP servers (optional). Only applicable for HTTP/HTTPS transport. */
    private Map<String, String> headers;

    private Map<String, Object> arguments = new HashMap<>();
}
