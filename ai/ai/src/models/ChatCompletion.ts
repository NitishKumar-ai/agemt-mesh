import { LLMWorkerInput } from './LLMWorkerInput.js';
import { ChatMessage, ChatMessageRole } from './ChatMessage.js';
import { ToolSpec } from './ToolSpec.js';

/** Schema definition (mirrors Java SchemaDef) */
export interface SchemaDef {
  name?: string;
  version?: number;
  data?: Record<string, unknown>;
  externalRef?: string;
}

export class ChatCompletion extends LLMWorkerInput {
  static readonly NAME = 'LLM_CHAT_COMPLETE';

  instructions?: string;
  messages: ChatMessage[] = [];
  jsonOutput: boolean = false;
  googleSearchRetrieval: boolean = false;
  inputSchema?: SchemaDef;
  outputSchema?: SchemaDef;
  userInput?: string;
  tools: ToolSpec[] = [];
  participants: Record<string, ChatMessageRole> = {};
  outputMimeType?: string;

  /** Token budget for extended thinking/reasoning */
  thinkingTokenLimit: number = 0;

  /** Reasoning effort level: low, medium, or high. Supported by OpenAI. */
  reasoningEffort?: string;

  /** Reasoning summary mode. */
  reasoningSummary?: string;

  /** Location where results should be stored (useful for media generation). */
  outputLocation?: string;

  /**
   * ID of a previous response to chain multi-turn conversations without resending
   * full message history. Supported by OpenAI and Azure OpenAI (Responses API).
   */
  previousResponseId?: string;

  /** Enable built-in web search. */
  webSearch: boolean = false;

  /** Enable built-in code execution. */
  codeInterpreter: boolean = false;

  /** Vector store IDs for file search (OpenAI only). */
  fileSearchVectorStoreIds?: string[];

  /** Audio output voice. */
  voice?: string;

  getPrompt(): string | undefined {
    return this.instructions;
  }
}
