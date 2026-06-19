import {
  AudioGenRequest,
  ChatCompletion,
  EmbeddingGenRequest,
  ImageGenRequest,
  LLMResponse,
  ToolSpec,
  VideoGenRequest,
} from './models/index.js';
import {
  ChatModel,
  ChatOptions,
  ImageModel,
  ImageOptions,
  ToolCallback,
  VideoModel,
  VideoOptions,
} from './types/index.js';

export enum ConductorTask {
  CHAT_COMPLETE = 'CHAT_COMPLETE',
  GENERATE_IMAGE = 'GENERATE_IMAGE',
  GENERATE_VIDEO = 'GENERATE_VIDEO',
  TEXT_TO_SPEECH = 'TEXT_TO_SPEECH',
}

/** Interface for LLM provider implementations. */
export interface AIModel {
  getModelProvider(): string;
  getProviderAliases?(): string[];
  /** Whether this provider accepts a trailing assistant message (prefill). Default true. */
  supportsAssistantPrefill?(): boolean;

  generateEmbeddings(request: EmbeddingGenRequest): Promise<number[]>;
  getChatModel(): ChatModel;
  getChatOptions?(input: ChatCompletion): ChatOptions;
  getImageModel(): ImageModel;
  getImageOptions?(input: ImageGenRequest): ImageOptions;
  getVideoModel?(): VideoModel | null;
  getVideoOptions?(input: VideoGenRequest): VideoOptions;
  getToolCallbacks?(input: ChatCompletion): ToolCallback[];

  generateVideo?(request: VideoGenRequest): Promise<LLMResponse>;
  checkVideoStatus?(request: VideoGenRequest): Promise<LLMResponse>;
  generateAudio?(request: AudioGenRequest): Promise<LLMResponse>;
}

/** Configuration factory for an AIModel. */
export interface ModelConfiguration<T extends AIModel> {
  get(): T;
  setHttpClient?(httpClient: unknown): void;
}

/** Build a URL from a string; returns undefined for blank or invalid input. */
export function getURI(input: string | undefined | null): URL | undefined {
  if (!input?.trim()) return undefined;
  try { return new URL(input); } catch { return undefined; }
}

export function buildToolCallbacks(input: ChatCompletion): ToolCallback[] {
  return (input.tools ?? []).map((tool: ToolSpec) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema ? JSON.stringify(tool.inputSchema) : undefined,
  }));
}

export function buildDefaultChatOptions(input: ChatCompletion): ChatOptions {
  return {
    model: input.model,
    maxTokens: input.maxTokens,
    topP: input.topP,
    temperature: input.temperature,
    stopSequences: input.stopWords,
    frequencyPenalty: input.frequencyPenalty,
    topK: input.topK,
    presencePenalty: input.presencePenalty,
    toolCallbacks: buildToolCallbacks(input),
    internalToolExecutionEnabled: false,
  };
}

export function buildDefaultImageOptions(input: ImageGenRequest): ImageOptions {
  return {
    model: input.model,
    height: input.height,
    width: input.width,
    n: input.n,
    responseFormat: 'b64_json',
    style: input.style,
  };
}

export function buildDefaultVideoOptions(input: VideoGenRequest): VideoOptions {
  return {
    model: input.model,
    duration: input.duration,
    width: input.width,
    height: input.height,
    fps: input.fps,
    outputFormat: input.outputFormat,
    n: input.n,
    style: input.style,
    motion: input.motion,
    seed: input.seed,
    guidanceScale: input.guidanceScale,
    aspectRatio: input.aspectRatio,
    generateThumbnail: input.generateThumbnail,
    thumbnailTimestamp: input.thumbnailTimestamp,
    inputImage: input.inputImage,
    negativePrompt: input.negativePrompt,
    personGeneration: input.personGeneration,
    resolution: input.resolution,
    generateAudio: input.generateAudio,
    size: input.size,
  };
}
