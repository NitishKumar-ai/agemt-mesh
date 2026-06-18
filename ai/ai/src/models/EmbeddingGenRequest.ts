import { LLMWorkerInput } from './LLMWorkerInput.js';

export class EmbeddingGenRequest extends LLMWorkerInput {
  text?: string;
  dimensions?: number;
}
