import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicProvider, AnthropicChatModel } from '../../../main/typescript/providers/AnthropicProvider.js';
import { Anthropic } from '@anthropic-ai/sdk';
import { EmbeddingGenRequest, ChatMessageRole } from '../../../main/typescript/models/index.js';
import { ChatPrompt } from '../../../main/typescript/types/index.js';

vi.mock('@anthropic-ai/sdk', () => {
  const AnthropicMock = vi.fn().mockImplementation(() => {
    return {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Hello!' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      },
    };
  });
  return { Anthropic: AnthropicMock };
});

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    provider = new AnthropicProvider('test-api-key');
  });

  it('testGetModelProvider', () => {
    expect(provider.getModelProvider()).toBe('anthropic');
  });

  it('testGenerateEmbeddings_throwsUnsupportedException', async () => {
    await expect(provider.generateEmbeddings({} as EmbeddingGenRequest)).rejects.toThrow(
      'Anthropic does not support native embeddings generation currently.'
    );
  });

  it('testGetImageModel_throwsUnsupportedException', () => {
    expect(() => provider.getImageModel()).toThrow(
      'Anthropic does not support image generation.'
    );
  });

  it('testGetChatModel_createsModel', () => {
    const chatModel = provider.getChatModel();
    expect(chatModel).toBeDefined();
    expect(chatModel).toBeInstanceOf(AnthropicChatModel);
  });
  
  it('testSupportsAssistantPrefill', () => {
    expect(provider.supportsAssistantPrefill()).toBe(true);
  });
});

describe('AnthropicChatModel', () => {
  it('testChatCompletion', async () => {
    const provider = new AnthropicProvider('test-api-key');
    const chatModel = provider.getChatModel();

    const prompt: ChatPrompt = {
      options: { model: 'claude-haiku-4-5', maxTokens: 100, temperature: 0.7 },
      messages: [{ role: 'user', text: 'Say hello in one word' }],
    };

    const response = await chatModel.call(prompt);

    expect(response).toBeDefined();
    expect(response.results).toBeDefined();
    expect(response.results[0].output.text).toBe('Hello!');
    expect(response.metadata?.usage?.totalTokens).toBe(15);
  });
});
