import { z } from 'zod';

export const SourceSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  type: z.literal('Source'),
  title: z.string(),
  url: z.string().nullable().default(null),
  source_system: z.string(), // e.g. "slack", "notion", "gmail"
  source_id: z.string(),
  author: z.string().nullable().default(null),
  created_at: z.string(),
  updated_at: z.string(),
  authority_weight: z.number().min(0).max(1).default(0.5),
  permissions_hash: z.string().nullable().default(null),
});

export type Source = z.infer<typeof SourceSchema>;
