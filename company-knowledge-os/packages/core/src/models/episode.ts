import { z } from 'zod';

export const EpisodeSchema = z.object({
  episode_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  source_system: z.string(),
  source_id: z.string(),
  source_version: z.string(),
  raw_pointer: z.string(), // S3/GCS URL
  parsed_hash: z.string().optional(),
  parsed_content: z.record(z.string(), z.any()).optional(),
  author: z.string().optional(),
  created_at: z.string(),
  ingested_at: z.string().default(new Date().toISOString()),
});

export type Episode = z.infer<typeof EpisodeSchema>;

export interface IEpisode {
  episode_id: string;
  tenant_id: string;
  source_system: string;
  source_id: string;
  source_version: string;
  raw_pointer: string;
  parsed_hash?: string;
  parsed_content?: Record<string, any>;
  author?: string;
  created_at: Date;
  ingested_at: Date;
}