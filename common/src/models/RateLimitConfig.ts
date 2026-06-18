import { z } from 'zod';

import { RateLimitPolicy } from '../enums.js';

/** Port of `metadata.workflow.RateLimitConfig`. */
export const RateLimitConfigSchema = z.object({
  rateLimitKey: z.string().optional(),
  concurrentExecLimit: z.number().int().default(0),
  policy: z.nativeEnum(RateLimitPolicy).default(RateLimitPolicy.QUEUE),
});

export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;
