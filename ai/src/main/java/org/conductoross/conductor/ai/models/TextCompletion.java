package org.conductoross.conductor.ai.models;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;

@Data
@ToString
@EqualsAndHashCode(callSuper = true)
public class TextCompletion extends LLMWorkerInput {
    private boolean jsonOutput;
    private String promptName;
}
