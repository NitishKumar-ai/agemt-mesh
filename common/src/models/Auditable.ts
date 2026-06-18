import { z } from 'zod';

/**
 * Port of `metadata.Auditable`. Base class for models with audit fields.
 */
export const AuditableSchema = z.object({
  ownerApp: z.string().optional(),
  createTime: z.number().int().default(0),
  updateTime: z.number().int().default(0),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional(),
});

export type Auditable = z.infer<typeof AuditableSchema>;
