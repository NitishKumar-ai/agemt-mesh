import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiProvider, GeminiChatModel } from '../../../main/typescript/providers/GeminiProvider.js';
import { GoogleGenAI } from '@google/genai';
import { EmbeddingGenRequest } from '../../../main/typescript/models/index.js';
import { ChatPrompt } from '../../../main/typescript/types/index.js';

vi.mock('@google/genai', () => {
  const mockEmbedContent = vi.fn().mockResolvedValue({
    embeddings: [{ values: [0.1, 0.2, 0.3] }],
  });

  const mockGenerateContent = vi.fn().mockResolvedValue({
    text: 'Hello from Gemini!',
    candidates: [{ finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 4, totalTokenCount: 9 },
  });

  const GoogleGenAIMock = vi.fn().mockImplementation(() => {
    return {
      models: {
        embedContent: mockEmbedContent,
        generateContent: mockGenerateContent,
      },
    };
  });

  return { GoogleGenAI: GoogleGenAIMock };
});

describe('GeminiProvider', () => {
  let provider: GeminiProvider;

  beforeEach(() => {
    provider = new GeminiProvider('test-api-key');
  });

  it('testGetModelProvider', () => {
    expect(provider.getModelProvider()).toBe('gemini');
  });

  it('testGetProviderAliases', () => {
    expect(provider.getProviderAliases()).toContain('google');
  });

  it('testGenerateEmbeddings', async () => {
    const request: EmbeddingGenRequest = {
      model: 'text-embedding-004',
      text: 'Hello world',
    };

    const embeddings = await provider.generateEmbeddings(request);

    expect(embeddings).toBeDefined();
    expect(embeddings.length).toBe(3);
    expect(embeddings[0]).toBe(0.1);
  });

  it('testGetImageModel_throwsUnsupportedException', () => {
    expect(() => provider.getImageModel()).toThrow(
      'Gemini Image model not fully implemented in this example yet.'
    );
  });

  it('testGetChatModel_createsModel', () => {
    const chatModel = provider.getChatModel();
    expect(chatModel).toBeDefined();
    expect(chatModel).toBeInstanceOf(GeminiChatModel);
  });
  
  it('testSupportsAssistantPrefill', () => {
    expect(provider.supportsAssistantPrefill()).toBe(true);
  });
});

describe('GeminiChatModel', () => {
  it('testChatCompletion', async () => {
    const provider = new GeminiProvider('test-api-key');
    const chatModel = provider.getChatModel();

    const prompt: ChatPrompt = {
      options: { model: 'gemini-2.5-flash', maxTokens: 100, temperature: 0.7 },
      messages: [{ role: 'user', text: 'Say hello in one word' }],
    };

    const response = await chatModel.call(prompt);

    expect(response).toBeDefined();
    expect(response.results).toBeDefined();
    expect(response.results[0].output.text).toBe('Hello from Gemini!');
    expect(response.metadata?.usage?.totalTokens).toBe(9);
  });
});
