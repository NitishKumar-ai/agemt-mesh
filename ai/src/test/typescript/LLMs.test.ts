import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMs } from '../../main/typescript/LLMs.js';
import { AIModelProvider } from '../../main/typescript/AIModelProvider.js';
import { AIModel } from '../../main/typescript/AIModel.js';
import { EmbeddingGenRequest } from '../../main/typescript/models/index.js';
import { Task } from '../../main/typescript/types/index.js';

describe('LLMs', () => {
  let mockModelProvider: any;
  let mockModel: any;
  let llms: any;

  beforeEach(() => {
    mockModel = {
      generateEmbeddings: vi.fn(),
    };

    mockModelProvider = {
      payloadStoreLocation: '/tmp/test-payload',
      getModel: vi.fn().mockReturnValue(mockModel),
    };

    llms = new LLMs([], {} as any, mockModelProvider as unknown as AIModelProvider);
  });

  it('testConstructor_setsPayloadStoreLocation', () => {
    expect((llms as any).payloadStoreLocation).toBe('/tmp/test-payload');
  });

  it('testGenerateEmbeddings_delegatesToModel', async () => {
    const mockTask: Task = {
      workflowInstanceId: 'wf-1',
      taskId: 'task-1',
      taskDefName: 'test-task',
      taskType: 'test',
      status: 'IN_PROGRESS',
    };

    const expectedEmbeddings = [0.1, 0.2, 0.3];
    mockModel.generateEmbeddings.mockResolvedValue(expectedEmbeddings);

    const request: EmbeddingGenRequest = {
      llmProvider: 'openai',
    };

    const result = await llms.generateEmbeddings(mockTask, request);

    expect(result).toEqual(expectedEmbeddings);
    expect(mockModel.generateEmbeddings).toHaveBeenCalledWith(request);
  });

  it('testGenerateEmbeddings_usesCorrectProvider', async () => {
    const mockTask: Task = {
      workflowInstanceId: 'wf-1',
      taskId: 'task-1',
      taskDefName: 'test-task',
      taskType: 'test',
      status: 'IN_PROGRESS',
    };

    mockModel.generateEmbeddings.mockResolvedValue([0.5]);

    const request: EmbeddingGenRequest = {
      llmProvider: 'anthropic',
      model: 'text-embedding-model',
      text: 'Sample text for embedding',
    };

    await llms.generateEmbeddings(mockTask, request);

    expect(mockModelProvider.getModel).toHaveBeenCalledWith(request);
  });
});
