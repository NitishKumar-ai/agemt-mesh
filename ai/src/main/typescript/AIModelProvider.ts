import { AIModel, ModelConfiguration } from './AIModel.js';
import { LLMWorkerInput } from './models/index.js';
import { TokenUsageLog } from './types/index.js';

export class AIModelProvider {
  private readonly providerToLLM = new Map<string, AIModel>();
  readonly payloadStoreLocation: string;

  constructor(modelConfigurations: ModelConfiguration<AIModel>[], payloadStoreDir?: string) {
    this.payloadStoreLocation =
      payloadStoreDir ?? `${process.env['HOME'] ?? '/tmp'}/worker-payload/`;

    for (const config of modelConfigurations) {
      try {
        const llm = config.get();
        this.providerToLLM.set(llm.getModelProvider(), llm);
        for (const alias of llm.getProviderAliases?.() ?? []) {
          this.providerToLLM.set(alias, llm);
        }
      } catch (err) {
        console.error(`Cannot init model: ${(err as Error).message}`);
      }
    }
  }

  getModel(input: LLMWorkerInput): AIModel {
    const name = input.llmProvider;
    if (!name) throw new Error('llmProvider not specified');
    const model = this.providerToLLM.get(name);
    if (!model) throw new Error(`No configuration found for: ${name}`);
    return model;
  }

  getTokenUsageLogger(): (log: TokenUsageLog) => void {
    return (log) => console.info(JSON.stringify(log));
  }
}
