import { z } from 'zod';

export const NodeStatusEnum = z.enum([
  'current',
  'historical',
  'superseded',
  'contradicted',
  'invalidated',
  'uncertain',
  'draft',
  'stale',
]);

export type NodeStatus = z.infer<typeof NodeStatusEnum>;

export const NodeTypeEnum = z.enum([
  'Person',
  'Team',
  'Project',
  'Document',
  'Message',
  'Meeting',
  'Task',
  'Ticket',
  'Repository',
  'PullRequest',
  'Customer',
  'Account',
  'Incident',
  'Service',
  'Decision',
  'Fact',
  'Source',
  'Correction',
  // Growth Memory domain pack: campaign/feature intelligence entities. Additive;
  // existing company-brain types above are unchanged.
  'Campaign',
  'Channel',
  'Creative',
  'Feature',
  'Lead',
  'Payment',
  'Report',
  'Insight',
  'Action',
]);

export type NodeType = z.infer<typeof NodeTypeEnum>;

export const GraphNodeSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string(),
  type: NodeTypeEnum,
  canonical_name: z.string(),
  aliases: z.array(z.string()).default([]),
  source_system: z.string(),
  source_id: z.string(),
  confidence: z.number().min(0).max(1),
  status: NodeStatusEnum.default('current'),
  created_at: z.string(),
  updated_at: z.string(),
  valid_from: z.string().nullable().default(null),
  valid_to: z.string().nullable().default(null),
  recorded_from: z.string().nullable().default(null),
  recorded_to: z.string().nullable().default(null),
  last_seen_at: z.string(),
  permissions_hash: z.string().nullable().default(null),
  source_url: z.string().nullable().default(null),
  properties: z.record(z.any()).default({}), // Dynamic attributes
});

export type GraphNode = z.infer<typeof GraphNodeSchema>;
