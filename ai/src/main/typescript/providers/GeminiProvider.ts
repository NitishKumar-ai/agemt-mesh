import { GoogleGenAI } from '@google/genai';
import {
  AIModel,
} from '../AIModel.js';
import {
  EmbeddingGenRequest,
  ChatCompletion,
  ImageGenRequest,
  VideoGenRequest,
  LLMResponse,
} from '../models/index.js';
import {
  ChatModel,
  ChatResponse,
  ImageModel,
  GenerationResult,
  ChatPrompt,
} from '../types/index.js';

export class GeminiChatModel implements ChatModel {
  constructor(private readonly ai: GoogleGenAI) {}

  async call(prompt: ChatPrompt): Promise<ChatResponse> {
    const options = prompt.options || {};
    const model = (options.model as string) || 'gemini-2.5-flash';
    const messages = prompt.messages as any[];

    const contents: any[] = [];
    let systemInstruction: string | undefined = undefined;

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = (systemInstruction || '') + msg.text + '\n';
      } else if (msg.role === 'user') {
        const parts: any[] = [];
        if (msg.text) {
          parts.push({ text: msg.text });
        }
        for (const media of msg.media || []) {
          parts.push({
            inlineData: {
              mimeType: media.mimeType,
              data: typeof media.data === 'string' ? media.data : Buffer.from(media.data).toString('base64'),
            },
          });
        }
        contents.push({ role: 'user', parts });
      } else if (msg.role === 'assistant') {
        contents.push({ role: 'model', parts: [{ text: msg.text || '' }] });
      } else if (msg.role === 'tool_call') {
        const parts: any[] = (msg.toolCalls || []).map((tc: any) => ({
          functionCall: {
            name: tc.name,
            args: JSON.parse(tc.arguments || '{}'),
          },
        }));
        contents.push({ role: 'model', parts });
      } else if (msg.role === 'tool') {
        const parts: any[] = (msg.responses || []).map((r: any) => ({
          functionResponse: {
            name: r.name,
            response: JSON.parse(r.output || '{}'),
          },
        }));
        contents.push({ role: 'user', parts });
      }
    }

    const tools = (options.toolCallbacks || []).map((t: any) => ({
      functionDeclarations: [
        {
          name: t.name,
          description: t.description || '',
          parameters: t.inputSchema ? JSON.parse(t.inputSchema) : undefined,
        },
      ],
    }));

    const response = await this.ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: systemInstruction?.trim(),
        temperature: options.temperature as number,
        topP: options.topP as number,
        topK: options.topK as number,
        tools: tools.length > 0 ? tools : undefined,
      },
    });

    const result: GenerationResult = {
      output: {
        hasToolCalls: () => !!response.functionCalls && response.functionCalls.length > 0,
        text: response.text || '',
        toolCalls: (response.functionCalls || []).map((fc: any) => ({
          id: crypto.randomUUID(),
          name: fc.name,
          arguments: JSON.stringify(fc.args),
        })),
      },
      metadata: {
        finishReason: response.candidates?.[0]?.finishReason || undefined,
      },
    };

    return {
      results: [result],
      metadata: {
        usage: {
          promptTokens: response.usageMetadata?.promptTokenCount || 0,
          completionTokens: response.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: response.usageMetadata?.totalTokenCount || 0,
        },
      },
    };
  }
}

export class GeminiProvider implements AIModel {
  private ai: GoogleGenAI;

  constructor(apiKey?: string) {
    this.ai = new GoogleGenAI({
      apiKey: apiKey || process.env.GEMINI_API_KEY || '',
    });
  }

  getModelProvider(): string {
    return 'gemini';
  }

  getProviderAliases(): string[] {
    return ['google'];
  }

  supportsAssistantPrefill(): boolean {
    return true;
  }

  async generateEmbeddings(request: EmbeddingGenRequest): Promise<number[]> {
    const model = request.model || 'text-embedding-004';
    const result = await this.ai.models.embedContent({
      model,
      contents: request.text || '',
    });
    return result.embeddings?.[0]?.values || [];
  }

  getChatModel(): ChatModel {
    return new GeminiChatModel(this.ai);
  }

  getImageModel(): ImageModel {
    throw new Error('Gemini Image model not fully implemented in this example yet.');
  }
}
