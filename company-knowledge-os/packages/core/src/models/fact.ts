import { z } from 'zod';

export const FactSchema = z.object({
  fact_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  subject: z.string(),
  predicate: z.string(),
  object: z.union([z.string(), z.number(), z.boolean()]),
  confidence: z.number().min(0).max(1),
  status: z.enum(['active', 'superseded', 'disputed', 'deleted']),
  observed_at: z.string(),
  ingested_at: z.string().default(new Date().toISOString()),
  valid_from: z.string(),
  valid_to: z.string().nullable(),
  superseded_by: z.string().uuid().nullable(),
  episode_ids: z.array(z.string().uuid()),
  extractor_version: z.string(),
});

export type Fact = z.infer<typeof FactSchema>;

export interface IFact {
  fact_id: string;
  tenant_id: string;
  subject: string;
  predicate: string;
  object: string | number | boolean;
  confidence: number;
  status: 'active' | 'superseded' | 'disputed' | 'deleted';
  observed_at: Date;
  ingested_at: Date;
  valid_from: Date;
  valid_to: Date | null;
  superseded_by: string | null;
  episode_ids: string[];
  extractor_version: string;
}