import { AIModelProvider } from './AIModelProvider.js';
import { LLMHelper } from './LLMHelper.js';
import {
  AudioGenRequest,
  ChatCompletion,
  EmbeddingGenRequest,
  ImageGenRequest,
  LLMResponse,
  VideoGenRequest,
} from './models/index.js';
import { DocumentLoader, JsonSchemaValidator, Task, TokenUsageLog } from './types/index.js';

export class LLMs {
  protected readonly modelProvider: AIModelProvider;
  protected readonly helper: LLMHelper;
  protected readonly payloadStoreLocation: string;
  protected tokenUsageLogger: (log: TokenUsageLog) => void =
    (log) => console.info(JSON.stringify(log));

  constructor(
    documentLoaders: DocumentLoader[],
    jsonSchemaValidator: JsonSchemaValidator,
    modelProvider: AIModelProvider,
  ) {
    this.modelProvider = modelProvider;
    this.helper = new LLMHelper(jsonSchemaValidator, documentLoaders);
    this.payloadStoreLocation = modelProvider.payloadStoreLocation;
  }

  async chatComplete(task: Task, input: ChatCompletion): Promise<LLMResponse> {
    const llm = this.modelProvider.getModel(input);
    input.instructions = this.replacePromptVariables(input.instructions, input.promptVariables);
    return this.helper.chatComplete(task.taskId, llm, input, this.getPayloadStoreLocation(task), this.tokenUsageLogger);
  }

  async generateImage(task: Task, request: ImageGenRequest): Promise<LLMResponse> {
    const llm = this.modelProvider.getModel(request);
    request.prompt = this.replacePromptVariables(request.prompt, request.promptVariables);
    return this.helper.generateImage(task.taskId, llm, request, this.getPayloadStoreLocation(task), this.tokenUsageLogger);
  }

  async generateAudio(task: Task, request: AudioGenRequest): Promise<LLMResponse> {
    const llm = this.modelProvider.getModel(request);
    request.prompt = this.replacePromptVariables(request.prompt, request.promptVariables);
    return this.helper.generateAudio(task.taskId, llm, request, this.getPayloadStoreLocation(task), this.tokenUsageLogger);
  }

  async generateEmbeddings(task: Task, request: EmbeddingGenRequest): Promise<number[]> {
    return this.helper.generateEmbeddings(task.taskId, this.modelProvider.getModel(request), request, this.tokenUsageLogger);
  }

  async generateVideo(task: Task, request: VideoGenRequest): Promise<LLMResponse> {
    const llm = this.modelProvider.getModel(request);
    request.prompt = this.replacePromptVariables(request.prompt, request.promptVariables);
    return this.helper.generateVideo(task.taskId, llm, request, this.getPayloadStoreLocation(task), this.tokenUsageLogger);
  }

  async checkVideoStatus(task: Task, request: VideoGenRequest): Promise<LLMResponse> {
    return this.helper.checkVideoStatus(task.taskId, this.modelProvider.getModel(request), request, this.getPayloadStoreLocation(task));
  }

  replacePromptVariables(prompt: string | undefined, params?: Record<string, unknown>): string | undefined {
    if (!prompt || !params) return prompt;
    return prompt.replace(/\{(\w+)\}/g, (_, key) => String(params[key as string] ?? `{${key}}`));
  }

  getPayloadStoreLocation(task: Task): string {
    return `${this.payloadStoreLocation}/${task.workflowInstanceId}/${task.taskId}/${crypto.randomUUID()}`;
  }
}
