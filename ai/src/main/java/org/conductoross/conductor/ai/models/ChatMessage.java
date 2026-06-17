package org.conductoross.conductor.ai.models;

import java.util.ArrayList;
import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class ChatMessage {

    public enum Role {
        user,
        assistant,
        system,
        // When chat completes requests execution of tools
        tool_call,

        // Actual tool execution and its output
        tool
    }

    private Role role;
    private String message;
    private List<String> media = new ArrayList<>();
    private String mimeType;
    private List<ToolCall> toolCalls;

    public ChatMessage(Role role, String message) {
        this.role = role;
        this.message = message;
    }

    public ChatMessage(Role role, ToolCall toolCall) {
        this.role = role;
        this.toolCalls = List.of(toolCall);
    }
}
