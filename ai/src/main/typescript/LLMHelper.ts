import { buildDefaultChatOptions, buildDefaultImageOptions, AIModel, getURI } from './AIModel.js';
import {
  ChatModel,
  ChatOptions,
  ChatResponse,
  DocumentLoader,
  ImageModel,
  ImageOptions,
  JsonSchemaValidator,
  TokenUsageLog,
} from './types/index.js';
import {
  AudioGenRequest,
  ChatCompletion,
  ChatMessage,
  ChatMessageRole,
  EmbeddingGenRequest,
  ImageGenRequest,
  LLMResponse,
  Media,
  ToolCall,
  VideoGenRequest,
} from './models/index.js';

// Finish-reason normalization map
const FINISH_REASON_MAP: Record<string, string> = {
  end_turn: 'STOP',
  tool_use: 'TOOL_CALLS',
  refusal: 'CONTENT_FILTER',
};

function normalizeFinishReason(reason?: string): string {
  if (!reason) return '';
  return (FINISH_REASON_MAP[reason] ?? reason).toUpperCase();
}

function toJSON(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return String(value);
  }
}

function isJsonString(value: string): boolean {
  const t = value.trim();
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

// Internal message payload types
interface UserMsg {
  role: 'user';
  text: string;
  media?: MediaItem[];
}
interface AssistantMsg {
  role: 'assistant';
  text: string;
  toolCalls?: AssistantToolCallItem[];
}
interface SystemMsg {
  role: 'system';
  text: string;
}
interface ToolCallMsg {
  role: 'tool_call';
  toolCalls: AssistantToolCallItem[];
}
interface ToolResponseMsg {
  role: 'tool';
  responses: ToolResponseItem[];
}
type MessagePayload = UserMsg | AssistantMsg | SystemMsg | ToolCallMsg | ToolResponseMsg;

interface MediaItem {
  data: Uint8Array | string;
  mimeType: string;
}
interface AssistantToolCallItem {
  id: string;
  type: string;
  name: string;
  arguments: string;
}
interface ToolResponseItem {
  id: string;
  name: string;
  output: string;
}

export class LLMHelper {
  constructor(
    private readonly jsonSchemaValidator: JsonSchemaValidator,
    private readonly documentLoaders: DocumentLoader[],
  ) {}

  // ---- Public API ----

  async chatComplete(
    taskId: string,
    llm: AIModel,
    input: ChatCompletion,
    payloadStoreLocation: string,
    tokenUsageLogger: (log: TokenUsageLog) => void,
  ): Promise<LLMResponse> {
    const chatOptions = llm.getChatOptions
      ? llm.getChatOptions(input)
      : buildDefaultChatOptions(input);
    const response = await this.runChatComplete(llm.getChatModel(), chatOptions, input);
    this.extractResponse(response, input);
    this.storeMedia(payloadStoreLocation, response.media ?? []);
    tokenUsageLogger({
      taskId,
      api: input.model,
      integrationName: input.llmProvider,
      completionTokens: response.completionTokens,
      promptTokens: response.promptTokens,
      totalTokens: response.tokenUsed,
    });
    return response;
  }

  async generateImage(
    taskId: string,
    llm: AIModel,
    request: ImageGenRequest,
    payloadStoreLocation: string,
    tokenUsageLogger: (log: TokenUsageLog) => void,
  ): Promise<LLMResponse> {
    const options: ImageOptions = llm.getImageOptions
      ? llm.getImageOptions(request)
      : buildDefaultImageOptions(request);
    const response = await this.runGenerateImage(llm.getImageModel(), options, request);
    this.storeMedia(payloadStoreLocation, response.media ?? []);
    tokenUsageLogger({
      taskId,
      api: request.model,
      integrationName: request.llmProvider,
      completionTokens: response.completionTokens,
      promptTokens: response.promptTokens,
      totalTokens: response.tokenUsed,
    });
    return response;
  }

  async generateEmbeddings(
    _taskId: string,
    llm: AIModel,
    request: EmbeddingGenRequest,
    _logger: (log: TokenUsageLog) => void,
  ): Promise<number[]> {
    return llm.generateEmbeddings(request);
  }

  async generateAudio(
    taskId: string,
    llm: AIModel,
    request: AudioGenRequest,
    payloadStoreLocation: string,
    tokenUsageLogger: (log: TokenUsageLog) => void,
  ): Promise<LLMResponse> {
    if (!llm.generateAudio) throw new Error('Audio generation not supported by this provider');
    const response = await llm.generateAudio(request);
    this.storeMedia(payloadStoreLocation, response.media ?? []);
    tokenUsageLogger({
      taskId,
      api: request.model,
      integrationName: request.llmProvider,
      completionTokens: response.completionTokens,
      promptTokens: response.promptTokens,
      totalTokens: response.tokenUsed,
    });
    return response;
  }

  async generateVideo(
    _taskId: string,
    llm: AIModel,
    request: VideoGenRequest,
    _payloadStoreLocation: string,
    _logger: (log: TokenUsageLog) => void,
  ): Promise<LLMResponse> {
    if (!llm.generateVideo) throw new Error('Video generation not supported by this provider');
    return llm.generateVideo(request);
  }

  async checkVideoStatus(
    _taskId: string,
    llm: AIModel,
    request: VideoGenRequest,
    payloadStoreLocation: string,
  ): Promise<LLMResponse> {
    if (!llm.checkVideoStatus) throw new Error('Video status check not supported by this provider');
    const response = await llm.checkVideoStatus(request);
    if (response.finishReason === 'COMPLETED')
      this.storeMedia(payloadStoreLocation, response.media ?? []);
    return response;
  }

  // ---- Core chat completion ----

  private async runChatComplete(
    chatModel: ChatModel,
    chatOptions: ChatOptions,
    input: ChatCompletion,
  ): Promise<LLMResponse> {
    if (input.instructions?.trim()) {
      input.messages.unshift(new ChatMessage(ChatMessageRole.system, input.instructions));
    }

    const messages = input.messages.map((m) => this.constructMessage(m));
    this.ensureLastMessageIsFromUser(messages);

    const chatResponse: ChatResponse = await chatModel.call({ messages, options: chatOptions });
    if (!chatResponse) throw new Error('No response generated');

    if (!chatResponse.results.length) {
      return {
        result: JSON.stringify(chatResponse),
        completionTokens: chatResponse.metadata.usage.completionTokens,
        promptTokens: chatResponse.metadata.usage.promptTokens,
        tokenUsed: chatResponse.metadata.usage.totalTokens,
      };
    }

    const tools: ToolCall[] = [];
    const responses: string[] = [];
    const media: Media[] = [];
    let finishReason: string | undefined;

    for (const result of chatResponse.results) {
      if (result.output.hasToolCalls()) {
        for (const tc of result.output.toolCalls ?? []) {
          let args: Record<string, unknown> = {};
          try {
            args = this.parseNestedJsonStrings(JSON.parse(tc.arguments) as Record<string, unknown>);
          } catch {
            /* keep empty */
          }
          args['method'] = tc.name;
          const matched = input.tools.find((t) => t.name === tc.name);
          tools.push({
            taskReferenceName: tc.id || crypto.randomUUID(),
            name: tc.name,
            inputParameters: args,
            integrationNames: matched?.integrationNames ?? {},
            type: matched?.type ?? 'SIMPLE',
          });
        }
        finishReason = result.metadata.finishReason;
      } else {
        if (result.output.text) responses.push(result.output.text);
        for (const m of result.output.media ?? [])
          media.push({ data: m.data, mimeType: m.mimeType });
        if (!finishReason) finishReason = result.metadata.finishReason;
      }
    }

    const responseId = chatResponse.metadata['response_id'] as string | undefined;
    const reasoningRaw = chatResponse.metadata['reasoning'];
    const reasoning =
      typeof reasoningRaw === 'string' && reasoningRaw.trim() ? reasoningRaw : undefined;
    const rtRaw = chatResponse.metadata['reasoning_tokens'];
    const reasoningTokens = typeof rtRaw === 'number' ? Math.trunc(rtRaw) : undefined;

    return {
      result: responses.length === 1 ? responses[0] : responses,
      media,
      toolCalls: tools.length ? tools : undefined,
      finishReason: normalizeFinishReason(finishReason),
      responseId,
      reasoning,
      reasoningTokens,
      completionTokens: chatResponse.metadata.usage.completionTokens,
      promptTokens: chatResponse.metadata.usage.promptTokens,
      tokenUsed: chatResponse.metadata.usage.totalTokens,
    };
  }

  // ---- Image generation ----

  private async runGenerateImage(
    imageModel: ImageModel,
    options: ImageOptions,
    request: ImageGenRequest,
  ): Promise<LLMResponse> {
    const imgResponse = await imageModel.call({
      messages: [{ text: request.prompt ?? '', weight: request.weight }],
      options,
    });
    const mimeType = `image/${request.outputFormat ?? 'png'}`;
    const mediaList: Media[] = [];

    for (const result of imgResponse.results) {
      const { url, b64Json } = result.output;
      if (b64Json) {
        mediaList.push({ data: Buffer.from(b64Json, 'base64'), mimeType });
      } else if (url) {
        const bytes = await this.downloadBytes(url);
        if (bytes) {
          mediaList.push({ data: bytes, mimeType: this.mimeFromUrl(url, mimeType) });
        } else {
          console.warn(`Failed to download image from URL, keeping external URL: ${url}`);
          mediaList.push({ location: url, mimeType });
        }
      }
    }
    return { media: mediaList };
  }

  // ---- Message construction ----

  private constructMessage(msg: ChatMessage): MessagePayload {
    switch (msg.role) {
      case ChatMessageRole.user:
        return this.buildUserMessage(msg);
      case ChatMessageRole.assistant:
        return { role: 'assistant', text: msg.message ?? '' };
      case ChatMessageRole.system:
        return { role: 'system', text: msg.message ?? '' };
      case ChatMessageRole.tool_call:
        return {
          role: 'tool_call',
          toolCalls: (msg.toolCalls ?? []).map((tc) => ({
            id: tc.taskReferenceName ?? crypto.randomUUID(),
            type: 'function',
            name: this.extractMethodFromInputParameters(tc.inputParameters) ?? tc.name ?? '',
            arguments: toJSON(tc.inputParameters),
          })),
        };
      case ChatMessageRole.tool:
        return {
          role: 'tool',
          responses: (msg.toolCalls ?? []).map((tc) => ({
            id: tc.taskReferenceName ?? crypto.randomUUID(),
            name: this.extractMethodFromInputParameters(tc.inputParameters) ?? tc.name ?? '',
            output: toJSON(tc.output),
          })),
        };
      default:
        return { role: 'system', text: msg.message ?? '' };
    }
  }

  private buildUserMessage(msg: ChatMessage): UserMsg {
    const media = (msg.media ?? [])
      .map((m: string) => this.buildMediaItem(msg.mimeType, m))
      .filter((x: MediaItem | null): x is MediaItem => x !== null);
    return { role: 'user', text: msg.message ?? '', media };
  }

  private buildMediaItem(mimeType: string | undefined, content: string): MediaItem | null {
    const uri = getURI(content);
    if (!uri) return { data: content, mimeType: mimeType ?? '' };
    const loader = this.documentLoaders.find((l: DocumentLoader) => l.supports(content));
    if (!loader) return null;
    return { data: loader.download(content), mimeType: mimeType ?? this.mimeFromUrl(content, '') };
  }

  // ---- Response extraction ----

  private extractResponse(response: LLMResponse, input: ChatCompletion): void {
    if (response.result == null || response.result === '') return;
    if (typeof response.result === 'string') {
      response.result = this.tryConvertToJSON(response.result, input);
    } else if (Array.isArray(response.result)) {
      response.result = (response.result as unknown[]).map((item) =>
        this.tryConvertToJSON(String(item), input),
      );
    }
  }

  private tryConvertToJSON(text: string, input: ChatCompletion): unknown {
    let t = text.trim();
    if (t.startsWith('```json')) t = t.slice(7, t.length - 4);
    if (!isJsonString(t)) {
      if (input.jsonOutput)
        throw new Error(JSON.stringify({ error: 'Not a JSON response', response: text }));
      return t;
    }
    try {
      const parsed = JSON.parse(t) as Record<string, unknown>;
      if (input.outputSchema?.data) {
        const errors = this.jsonSchemaValidator.validate(
          JSON.stringify(input.outputSchema.data),
          parsed,
        );
        if (errors.length)
          throw new Error(`Output does not conform to schema: ${errors.join(', ')}`);
      }
      return parsed;
    } catch (e) {
      if (input.jsonOutput)
        throw new Error(JSON.stringify({ error: (e as Error).message, response: text }));
      return t;
    }
  }

  // ---- Utility methods ----

  ensureLastMessageIsFromUser(messages: MessagePayload[]): void {
    if (!messages.length) return;
    const last = messages[messages.length - 1];
    if (!last) return;
    if (last.role === 'user') return;
    if (last.role === 'assistant') {
      const partial = (last as AssistantMsg).text;
      messages.pop();
      messages.push({
        role: 'user',
        text: partial?.trim()
          ? `You were saying:\n\n${partial}\n\nPlease continue where you left off.`
          : 'Please continue where you left off.',
      });
    } else {
      messages.push({ role: 'user', text: 'Please continue where you left off.' });
    }
  }

  extractMethodFromInputParameters(params?: Record<string, unknown>): string | undefined {
    if (!params) return undefined;
    for (const value of Object.values(params)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nested = value as Record<string, unknown>;
        if ('method' in nested && nested['method'] != null) return String(nested['method']);
      }
    }
    return undefined;
  }

  parseNestedJsonStrings(input: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, this.parseValue(v)]));
  }

  private parseValue(value: unknown): unknown {
    if (typeof value === 'string' && isJsonString(value)) {
      try {
        const p: unknown = JSON.parse(value);
        if (Array.isArray(p)) return p.map((i) => this.parseValue(i));
        if (p && typeof p === 'object')
          return this.parseNestedJsonStrings(p as Record<string, unknown>);
        return p;
      } catch {
        return value;
      }
    }
    if (Array.isArray(value)) return value.map((i) => this.parseValue(i));
    if (value && typeof value === 'object')
      return this.parseNestedJsonStrings(value as Record<string, unknown>);
    return value;
  }

  // ---- Media storage ----

  private storeMedia(location: string, media: Media[]): void {
    const loader = this.documentLoaders.find((l) => l.supports(location));
    if (!loader) return;
    for (const m of media.filter((x) => x.data != null)) {
      const uniqueLocation = `${location}_${crypto.randomUUID()}${this.extOf(m.mimeType ?? '')}`;
      m.location = loader.upload({}, m.mimeType ?? '', m.data!, uniqueLocation);
      m.data = undefined;
    }
  }

  storeMediaStream(
    location: string,
    mimeType: string,
    stream: NodeJS.ReadableStream,
  ): string | undefined {
    const loader = this.documentLoaders.find((l) => l.supports(location));
    if (!loader) return undefined;
    const uniqueLocation = `${location}_${crypto.randomUUID()}${this.extOf(mimeType)}`;
    loader.upload({}, mimeType, stream, uniqueLocation);
    return uniqueLocation;
  }

  // ---- HTTP download ----

  private async downloadBytes(url: string): Promise<Uint8Array | null> {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return new Uint8Array(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  // ---- MIME helpers ----

  private mimeFromUrl(url: string, fallback: string): string {
    const ext = url.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      mp4: 'video/mp4',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      pdf: 'application/pdf',
    };
    return (ext && map[ext]) ?? fallback;
  }

  private extOf(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'video/mp4': '.mp4',
      'audio/mpeg': '.mp3',
      'audio/wav': '.wav',
      'application/pdf': '.pdf',
    };
    return map[mimeType] ?? '';
  }
}
