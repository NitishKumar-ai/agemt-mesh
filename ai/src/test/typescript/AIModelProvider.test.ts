import { describe, it, expect, vi } from 'vitest';
import { AIModelProvider } from '../../main/typescript/AIModelProvider.js';
import { AIModel, ModelConfiguration } from '../../main/typescript/AIModel.js';
import { LLMWorkerInput } from '../../main/typescript/models/index.js';

describe('AIModelProvider', () => {

  it('testEmptyProviderList', () => {
    const provider = new AIModelProvider([], '/tmp/test-payload');
    expect(provider).toBeDefined();
    expect(provider.payloadStoreLocation).toBe('/tmp/test-payload');
  });

  it('testGetModel_nullProviderThrowsException', () => {
    const provider = new AIModelProvider([], '/tmp/test-payload');
    const input = { llmProvider: '' } as LLMWorkerInput;
    
    expect(() => provider.getModel(input)).toThrow('llmProvider not specified');
  });

  it('testGetModel_unknownProviderThrowsException', () => {
    const provider = new AIModelProvider([], '/tmp/test-payload');
    const input = { llmProvider: 'unknown_provider' } as LLMWorkerInput;
    
    expect(() => provider.getModel(input)).toThrow('No configuration found for: unknown_provider');
  });

  it('testGetModel_registeredProviderReturnsModel', () => {
    const mockModel = {
      getModelProvider: vi.fn().mockReturnValue('test_provider'),
      getProviderAliases: vi.fn().mockReturnValue([]),
    } as unknown as AIModel;

    const mockConfig = {
      get: vi.fn().mockReturnValue(mockModel),
    } as unknown as ModelConfiguration<AIModel>;

    const provider = new AIModelProvider([mockConfig], '/tmp/test-payload');

    const input = { llmProvider: 'test_provider' } as LLMWorkerInput;
    const result = provider.getModel(input);

    expect(result).toBeDefined();
    expect(result.getModelProvider()).toBe('test_provider');
  });

  it('testMultipleProviders', () => {
    const mockModel1 = {
      getModelProvider: vi.fn().mockReturnValue('provider1'),
      getProviderAliases: vi.fn().mockReturnValue([]),
    } as unknown as AIModel;

    const mockModel2 = {
      getModelProvider: vi.fn().mockReturnValue('provider2'),
      getProviderAliases: vi.fn().mockReturnValue([]),
    } as unknown as AIModel;

    const mockConfig1 = { get: vi.fn().mockReturnValue(mockModel1) } as unknown as ModelConfiguration<AIModel>;
    const mockConfig2 = { get: vi.fn().mockReturnValue(mockModel2) } as unknown as ModelConfiguration<AIModel>;

    const provider = new AIModelProvider([mockConfig1, mockConfig2], '/tmp/test-payload');

    const input1 = { llmProvider: 'provider1' } as LLMWorkerInput;
    expect(provider.getModel(input1).getModelProvider()).toBe('provider1');

    const input2 = { llmProvider: 'provider2' } as LLMWorkerInput;
    expect(provider.getModel(input2).getModelProvider()).toBe('provider2');
  });

  it('testProviderInitializationFailure_logsAndContinues', () => {
    const failingConfig = {
      get: vi.fn().mockImplementation(() => { throw new Error('Initialization failed'); }),
    } as unknown as ModelConfiguration<AIModel>;

    const mockModel = {
      getModelProvider: vi.fn().mockReturnValue('valid_provider'),
      getProviderAliases: vi.fn().mockReturnValue([]),
    } as unknown as AIModel;

    const validConfig = { get: vi.fn().mockReturnValue(mockModel) } as unknown as ModelConfiguration<AIModel>;

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const provider = new AIModelProvider([failingConfig, validConfig], '/tmp/test-payload');

    const input = { llmProvider: 'valid_provider' } as LLMWorkerInput;
    expect(provider.getModel(input)).toBeDefined();

    expect(consoleSpy).toHaveBeenCalledWith('Cannot init model: Initialization failed');
    consoleSpy.mockRestore();
  });

  it('testGetTokenUsageLogger_returnsConsumer', () => {
    const provider = new AIModelProvider([], '/tmp/test-payload');
    expect(provider.getTokenUsageLogger()).toBeDefined();
  });

  it('testPayloadStoreLocation_defaultValue', () => {
    const envBackup = process.env.HOME;
    process.env.HOME = '/fake/home';
    
    try {
      const mockModel = {
        getModelProvider: vi.fn().mockReturnValue('test'),
        getProviderAliases: vi.fn().mockReturnValue([]),
      } as unknown as AIModel;

      const mockConfig = { get: vi.fn().mockReturnValue(mockModel) } as unknown as ModelConfiguration<AIModel>;

      const provider = new AIModelProvider([mockConfig]);

      expect(provider.payloadStoreLocation).toBe('/fake/home/worker-payload/');
    } finally {
      process.env.HOME = envBackup;
    }
  });

});
