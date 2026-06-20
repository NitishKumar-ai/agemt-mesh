import { z } from 'zod';

export const RelationSchema = z.object({
  relation_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  relation_type: z.string(),
  source_entity_id: z.string().uuid(),
  target_entity_id: z.string().uuid(),
  confidence: z.number().min(0).max(1),
  status: z.enum(['active', 'superseded']),
  observed_at: z.string(),
  ingested_at: z.string(),
  episode_ids: z.array(z.string().uuid()),
  extractor_version: z.string(),
});

export type Relation = z.infer<typeof RelationSchema>;

export interface IRelation {
  relation_id: string;
  tenant_id: string;
  relation_type: string;
  source_entity_id: string;
  target_entity_id: string;
  confidence: number;
  status: 'active' | 'superseded';
  observed_at: Date;
  ingested_at: Date;
  episode_ids: string[];
  extractor_version: string;
}
