import { z } from 'zod';

export const EntitySchema = z.object({
  entity_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  name: z.string(),
  entity_type: z.string(),
  aliases: z.array(z.string()).default([]),
  source_refs: z.array(z.record(z.string(), z.any())).default([]),
  created_at: z.string().default(new Date().toISOString()),
});

export type Entity = z.infer<typeof EntitySchema>;

export interface IEntity {
  entity_id: string;
  tenant_id: string;
  name: string;
  entity_type: string;
  aliases?: string[];
  source_refs?: Array<Record<string, any>>;
  created_at?: Date;
}