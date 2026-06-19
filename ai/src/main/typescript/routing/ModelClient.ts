import { AIModelProvider } from '../AIModelProvider.js';
import { LLMWorkerInput, ChatCompletion } from '../models/index.js';
import { AIModel } from '../AIModel.js';

/**
 * ModelClient provides tiered routing logic for AI models.
 * For example, it routes "plan" or "triage" tasks to a fast/cheap model (like Flash/Haiku),
 * and "execute" tasks to a reasoning/pro model (like Sonnet/Pro).
 */
export class ModelClient {
  constructor(private readonly provider: AIModelProvider) {}

  /**
   * Routes the task to the appropriate AIModel based on task tags or hints.
   * If input.llmProvider is explicitly specified, it uses that.
   * Otherwise, it uses tiered routing based on hints.
   */
  route(input: LLMWorkerInput & { routingHint?: 'triage' | 'plan' | 'execute' }): AIModel {
    if (input.llmProvider && input.llmProvider !== 'auto') {
      return this.provider.getModel(input);
    }

    const hint = input.routingHint || 'execute';

    // Simple Tiered Routing Strategy
    // We default to Anthropic if no specific provider is requested, but this could be configurable.
    let providerName = 'anthropic';
    let modelName = '';

    if (hint === 'triage' || hint === 'plan') {
      // Use faster models
      providerName = 'gemini';
      modelName = 'gemini-2.5-flash';
    } else {
      // Use reasoning models
      providerName = 'anthropic';
      modelName = 'claude-3-7-sonnet-20250219';
    }

    // Temporarily mutate input so the underlying provider gets the right model
    // In a real scenario, this would be cloned or passed via a wrapper.
    (input as any).llmProvider = providerName;
    (input as any).model = modelName;

    return this.provider.getModel(input);
  }

  /**
   * Calculates the cost in USD based on the model used, prompt tokens, and completion tokens.
   */
  public calculateCost(model: string, promptTokens: number, completionTokens: number): number {
    const lowerModel = model.toLowerCase();
    
    // Default prices per 1M tokens (input / output)
    let inputPricePerM = 3.00;
    let outputPricePerM = 15.00;

    if (lowerModel.includes('claude-3-7-sonnet') || lowerModel.includes('claude-3.7-sonnet')) {
      inputPricePerM = 3.00;
      outputPricePerM = 15.00;
    } else if (lowerModel.includes('gemini-2.5-flash') || lowerModel.includes('gemini-2.5-flash')) {
      inputPricePerM = 0.075;
      outputPricePerM = 0.30;
    } else if (lowerModel.includes('gemini-1.5-flash')) {
      inputPricePerM = 0.075;
      outputPricePerM = 0.30;
    } else if (lowerModel.includes('haiku')) {
      inputPricePerM = 0.25;
      outputPricePerM = 1.25;
    }

    const inputCost = (promptTokens / 1_000_000) * inputPricePerM;
    const outputCost = (completionTokens / 1_000_000) * outputPricePerM;
    return inputCost + outputCost;
  }
}
