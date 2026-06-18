import { z } from 'zod';

import { IdempotencyStrategy } from '../enums.js';

/**
 * Port of `metadata.workflow.SubWorkflowParams`.
 *
 * `workflowDefinition` is `Object` in Java (either an inlined WorkflowDef or a
 * string ref), so it stays `unknown` here. `priority` is also `Object` in Java.
 */
export const SubWorkflowParamsSchema = z.object({
  name: z.string().optional(),
  version: z.number().int().optional(),
  taskToDomain: z.record(z.string()).optional(),
  workflowDefinition: z.unknown().optional(),
  idempotencyKey: z.string().optional(),
  idempotencyStrategy: z.nativeEnum(IdempotencyStrategy).optional(),
  priority: z.unknown().optional(),
});

export type SubWorkflowParams = z.infer<typeof SubWorkflowParamsSchema>;
