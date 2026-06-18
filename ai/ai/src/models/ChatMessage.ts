import { ToolCall } from './ToolCall.js';

export enum ChatMessageRole {
  user = 'user',
  assistant = 'assistant',
  system = 'system',
  /** When chat completes requests execution of tools */
  tool_call = 'tool_call',
  /** Actual tool execution and its output */
  tool = 'tool',
}

export class ChatMessage {
  role: ChatMessageRole;
  message?: string;
  media: string[] = [];
  mimeType?: string;
  toolCalls?: ToolCall[];

  constructor(role: ChatMessageRole, messageOrToolCall?: string | ToolCall) {
    this.role = role;
    if (typeof messageOrToolCall === 'string') {
      this.message = messageOrToolCall;
    } else if (messageOrToolCall) {
      this.toolCalls = [messageOrToolCall];
    }
  }
}
