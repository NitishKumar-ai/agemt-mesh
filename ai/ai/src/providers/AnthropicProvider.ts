import { Anthropic } from '@anthropic-ai/sdk';
import {
  AIModel,
} from '../AIModel.js';
import {
  EmbeddingGenRequest,
  ChatCompletion,
  ImageGenRequest,
  VideoGenRequest,
  LLMResponse,
  AudioGenRequest,
  ChatMessageRole,
} from '../models/index.js';
import {
  ChatModel,
  ChatOptions,
  ChatResponse,
  ImageModel,
  ImageOptions,
  VideoModel,
  VideoOptions,
  GenerationResult,
  ChatPrompt,
} from '../types/index.js';

export class AnthropicChatModel implements ChatModel {
  constructor(private readonly client: Anthropic) {}

  async call(prompt: ChatPrompt): Promise<ChatResponse> {
    const options = prompt.options || {};
    const model = (options.model as string) || 'claude-3-7-sonnet-20250219';
    const messages = prompt.messages as any[]; // Internal payload from LLMHelper

    const anthropicMessages: Anthropic.MessageParam[] = [];
    let systemText = '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemText += msg.text + '\n';
      } else if (msg.role === 'user') {
        const content: Anthropic.MessageParam['content'] = [];
        if (msg.text) {
          content.push({ type: 'text', text: msg.text });
        }
        for (const media of msg.media || []) {
          content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: media.mimeType as any,
              data: typeof media.data === 'string' ? media.data : Buffer.from(media.data).toString('base64'),
            },
          });
        }
        anthropicMessages.push({ role: 'user', content });
      } else if (msg.role === 'assistant') {
        anthropicMessages.push({ role: 'assistant', content: msg.text || '' });
      } else if (msg.role === 'tool') {
        const content: any[] = (msg.responses || []).map((r: any) => ({
          type: 'tool_result',
          tool_use_id: r.id,
          content: r.output,
        }));
        anthropicMessages.push({ role: 'user', content });
      } else if (msg.role === 'tool_call') {
        const content: any[] = (msg.toolCalls || []).map((tc: any) => ({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: JSON.parse(tc.arguments || '{}'),
        }));
        anthropicMessages.push({ role: 'assistant', content });
      }
    }

    const tools = (options.toolCallbacks || []).map((t: any) => ({
      name: t.name,
      description: t.description || '',
      input_schema: t.inputSchema ? JSON.parse(t.inputSchema) : { type: 'object', properties: {} },
    }));

    const response = await this.client.messages.create({
      model,
      max_tokens: (options.maxTokens as number) || 4096,
      temperature: options.temperature as number,
      top_p: options.topP as number,
      top_k: options.topK as number,
      system: systemText.trim() || undefined,
      messages: anthropicMessages,
      tools: tools.length > 0 ? tools : undefined,
    });

    const result: GenerationResult = {
      output: {
        hasToolCalls: () => response.content.some((c) => c.type === 'tool_use'),
        text: response.content
          .filter((c) => c.type === 'text')
          .map((c: any) => c.text)
          .join('\n'),
        toolCalls: response.content
          .filter((c) => c.type === 'tool_use')
          .map((c: any) => ({
            id: c.id,
            name: c.name,
            arguments: JSON.stringify(c.input),
          })),
      },
      metadata: {
        finishReason: response.stop_reason || undefined,
      },
    };

    return {
      results: [result],
      metadata: {
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
      },
    };
  }
}

export class AnthropicProvider implements AIModel {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY || '',
    });
  }

  getModelProvider(): string {
    return 'anthropic';
  }

  getProviderAliases(): string[] {
    return ['claude'];
  }

  supportsAssistantPrefill(): boolean {
    return true;
  }

  async generateEmbeddings(_request: EmbeddingGenRequest): Promise<number[]> {
    throw new Error('Anthropic does not support native embeddings generation currently.');
  }

  getChatModel(): ChatModel {
    return new AnthropicChatModel(this.client);
  }

  getImageModel(): ImageModel {
    throw new Error('Anthropic does not support image generation.');
  }
}
