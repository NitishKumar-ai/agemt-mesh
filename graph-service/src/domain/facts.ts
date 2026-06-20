import { z } from 'zod';
import { NodeStatusEnum } from './entities.js';

export const FactSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string(),
  entity_id: z.string(), // ID of the node this fact describes (e.g. Project uuid)
  predicate: z.string(), // e.g. "deadline", "owner", "status"
  value: z.any(),        // JSON value, e.g. "2026-08-01" or {"name": "Nitish"}
  confidence: z.number().min(0).max(1),
  status: NodeStatusEnum.default('current'),
  valid_from: z.string().nullable().default(null),
  valid_to: z.string().nullable().default(null),
  recorded_from: z.string().nullable().default(null),
  recorded_to: z.string().nullable().default(null),
  source_id: z.string(), // Direct source node ID proving this fact
  evidence_spans: z.array(z.string()).default([]), // Verbatim snippets or paragraphs
  last_seen_at: z.string(),
});

export type Fact = z.infer<typeof FactSchema>;
