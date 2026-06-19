import { LLMWorkerInput } from './LLMWorkerInput.js';

export class AudioGenRequest extends LLMWorkerInput {
  text?: string;
  voice?: string;
  speed: number = 1.0;
  responseFormat: string = 'mp3';
  n: number = 1;
}
