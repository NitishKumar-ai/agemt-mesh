export class LLMWorkerInput {
  integrationNames: Record<string, string> = {};
  llmProvider?: string;
  integrationName?: string;
  model?: string;

  prompt?: string;
  promptVersion?: number;
  promptVariables?: Record<string, unknown>;

  temperature?: number;
  frequencyPenalty?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  stopWords?: string[];
  maxTokens: number = 8192;
  maxResults: number = 1;
  allowRawPrompts: boolean = false;

  getIntegrationNames(): Record<string, string> {
    if (this.llmProvider && !this.integrationNames['AI_MODEL']) {
      this.integrationNames['AI_MODEL'] = this.llmProvider;
    }
    return this.integrationNames;
  }
}
