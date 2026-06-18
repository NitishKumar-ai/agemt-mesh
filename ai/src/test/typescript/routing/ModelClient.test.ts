import { describe, it, expect, vi } from 'vitest';
import { ModelClient } from '../../../main/typescript/routing/ModelClient.js';
import { AIModelProvider } from '../../../main/typescript/AIModelProvider.js';
import { LLMWorkerInput } from '../../../main/typescript/models/LLMWorkerInput.js';

describe('ModelClient', () => {
  it('should route "triage" hint to gemini-2.5-flash', () => {
    const mockProvider = {
      getModel: vi.fn().mockReturnValue({ getModelProvider: () => 'gemini' }),
    } as unknown as AIModelProvider;

    const client = new ModelClient(mockProvider);
    const input = {
      routingHint: 'triage',
    } as LLMWorkerInput & { routingHint: string };

    const model = client.route(input);
    
    expect(mockProvider.getModel).toHaveBeenCalled();
    const calledWith = vi.mocked(mockProvider.getModel).mock.calls[0][0];
    
    expect(calledWith.llmProvider).toBe('gemini');
    expect((calledWith as any).model).toBe('gemini-2.5-flash');
    expect(model.getModelProvider()).toBe('gemini');
  });

  it('should route "execute" hint to claude-3-7-sonnet-20250219', () => {
    const mockProvider = {
      getModel: vi.fn().mockReturnValue({ getModelProvider: () => 'anthropic' }),
    } as unknown as AIModelProvider;

    const client = new ModelClient(mockProvider);
    const input = {
      routingHint: 'execute',
    } as LLMWorkerInput & { routingHint: string };

    const model = client.route(input);
    
    expect(mockProvider.getModel).toHaveBeenCalled();
    const calledWith = vi.mocked(mockProvider.getModel).mock.calls[0][0];
    
    expect(calledWith.llmProvider).toBe('anthropic');
    expect((calledWith as any).model).toBe('claude-3-7-sonnet-20250219');
    expect(model.getModelProvider()).toBe('anthropic');
  });

  it('should respect explicitly provided llmProvider', () => {
    const mockProvider = {
      getModel: vi.fn().mockReturnValue({ getModelProvider: () => 'custom' }),
    } as unknown as AIModelProvider;

    const client = new ModelClient(mockProvider);
    const input = {
      llmProvider: 'custom',
    } as LLMWorkerInput;

    const model = client.route(input);
    
    expect(mockProvider.getModel).toHaveBeenCalled();
    const calledWith = vi.mocked(mockProvider.getModel).mock.calls[0][0];
    
    expect(calledWith.llmProvider).toBe('custom');
    expect(model.getModelProvider()).toBe('custom');
  });
});
