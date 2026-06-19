import { LLMWorkerInput } from './LLMWorkerInput.js';

export class VideoGenRequest extends LLMWorkerInput {
  /** Base64-encoded or URL of input image (required for image-to-video providers) */
  inputImage?: string;
  duration: number = 5; // seconds
  width: number = 1280;
  height: number = 720;
  fps: number = 24;
  outputFormat: string = 'mp4';

  style?: string; // cinematic, animated, realistic, etc.
  motion?: string; // slow, medium, fast, extreme
  seed?: number;
  guidanceScale?: number; // 1.0–20.0
  aspectRatio?: string; // 16:9, 9:16, 1:1, 4:3

  negativePrompt?: string;
  personGeneration?: string; // Gemini: "dont_allow" / "allow_adult"
  resolution?: string; // Gemini: "720p" / "1080p"
  generateAudio?: boolean; // Gemini Veo 3+
  size?: string; // OpenAI Sora: "1280x720" format

  generateThumbnail: boolean = true;
  thumbnailTimestamp?: number;

  maxDurationSeconds?: number;
  maxCostDollars?: number;

  // Polling state (populated during async processing)
  jobId?: string;
  status?: string; // SUBMITTED, PROCESSING, COMPLETED, FAILED
  pollCount?: number;

  n: number = 1;
}
