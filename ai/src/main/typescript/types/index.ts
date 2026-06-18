/** Minimal Task contract (mirrors AgentMesh Task metadata). */
export interface Task {
  taskId: string;
  workflowInstanceId: string;
}

/** Token usage log emitted after each LLM call. */
export interface TokenUsageLog {
  taskId?: string;
  api?: string;
  integrationName?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/** Document loader contract — supports URI-based download and upload. */
export interface DocumentLoader {
  supports(location: string): boolean;
  download(location: string): Uint8Array;
  upload(
    metadata: Record<string, unknown>,
    mimeType: string,
    data: Uint8Array | NodeJS.ReadableStream,
    targetLocation: string,
  ): string;
}

/** JSON schema validator contract. */
export interface JsonSchemaValidator {
  validate(schema: string, data: Record<string, unknown>): string[];
}

// ---- Spring AI stand-in contracts ----

export interface ToolCallback {
  name: string;
  description?: string;
  inputSchema?: string;
}

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  topP?: number;
  temperature?: number;
  stopSequences?: string[];
  frequencyPenalty?: number;
  topK?: number;
  presencePenalty?: number;
  toolCallbacks?: ToolCallback[];
  internalToolExecutionEnabled?: boolean;
  [key: string]: unknown;
}

export interface AssistantToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface MediaOutput {
  data: Uint8Array;
  mimeType: string;
}

export interface GenerationMetadata {
  finishReason?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ResponseMetadata {
  usage: TokenUsage;
  [key: string]: unknown;
}

export interface AssistantOutput {
  text?: string;
  toolCalls?: AssistantToolCall[];
  media?: MediaOutput[];
  hasToolCalls(): boolean;
}

export interface GenerationResult {
  output: AssistantOutput;
  metadata: GenerationMetadata;
}

export interface ChatResponse {
  results: GenerationResult[];
  metadata: ResponseMetadata;
}

export interface ChatPrompt {
  messages: unknown[];
  options?: ChatOptions;
}

export interface ChatModel {
  call(prompt: ChatPrompt): Promise<ChatResponse>;
}

export interface ImageOptions {
  model?: string;
  height?: number;
  width?: number;
  n?: number;
  responseFormat?: string;
  style?: string;
  [key: string]: unknown;
}

export interface ImageOutput {
  url?: string;
  b64Json?: string;
}

export interface ImageGenerationResult {
  output: ImageOutput;
}

export interface ImageResponse {
  results: ImageGenerationResult[];
}

export interface ImageModel {
  call(prompt: { messages: { text: string; weight?: number }[]; options?: ImageOptions }): Promise<ImageResponse>;
}

export interface VideoOptions {
  model?: string;
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  outputFormat?: string;
  n?: number;
  style?: string;
  motion?: string;
  seed?: number;
  guidanceScale?: number;
  aspectRatio?: string;
  generateThumbnail?: boolean;
  thumbnailTimestamp?: number;
  inputImage?: string;
  negativePrompt?: string;
  personGeneration?: string;
  resolution?: string;
  generateAudio?: boolean;
  size?: string;
  [key: string]: unknown;
}

export interface VideoModel {
  generate(prompt: string, options: VideoOptions): Promise<import('../models/index.js').LLMResponse>;
}
