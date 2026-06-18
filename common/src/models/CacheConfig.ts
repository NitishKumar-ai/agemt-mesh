import { z } from 'zod';

/** Port of `metadata.workflow.CacheConfig`. */
export const CacheConfigSchema = z.object({
  key: z.string().optional(),
  ttlInSecond: z.number().int().default(0),
});

export type CacheConfig = z.infer<typeof CacheConfigSchema>;
