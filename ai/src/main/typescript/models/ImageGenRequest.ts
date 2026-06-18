import { LLMWorkerInput } from './LLMWorkerInput.js';

export enum ImageOutputFormat {
  jpg = 'jpg',
  png = 'png',
  webp = 'webp',
}

export class ImageGenRequest extends LLMWorkerInput {
  weight: number = 0;
  n: number = 1;
  width: number = 1024;
  height: number = 1024;
  size?: string;
  style?: string;
  outputFormat: ImageOutputFormat = ImageOutputFormat.png;
}
