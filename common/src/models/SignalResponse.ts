import { z } from 'zod';

import { WorkflowSignalReturnStrategy } from '../enums.js';

/**
 * Port of `org.agentmeshoss.agentmesh.model.SignalResponse`.
 */
export const SignalResponseSchema = z.object({
  responseType: z.nativeEnum(WorkflowSignalReturnStrategy).optional(),
  targetWorkflowId: z.string().optional(),
  targetWorkflowStatus: z.string().optional(),
  requestId: z.string().optional(),
  workflowId: z.string().optional(),
  correlationId: z.string().optional(),
  input: z.record(z.unknown()).default({}),
  output: z.record(z.unknown()).default({}),
});

export type SignalResponse = z.infer<typeof SignalResponseSchema>;
