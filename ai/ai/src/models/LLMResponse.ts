import { Media } from './Media.js';
import { ToolCall } from './ToolCall.js';

export interface LLMResponse {
  result?: unknown;
  media?: Media[];
  finishReason?: string;
  tokenUsed?: number;
  promptTokens?: number;
  completionTokens?: number;
  toolCalls?: ToolCall[];
  jobId?: string;
  responseId?: string;
  reasoning?: string;
  reasoningTokens?: number;
}

export function hasToolCalls(response: LLMResponse): boolean {
  return (response.toolCalls?.length ?? 0) > 0;
}
