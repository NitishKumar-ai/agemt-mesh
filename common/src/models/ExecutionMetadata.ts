import { z } from 'zod';

/**
 * Execution metadata for capturing operational metadata.
 * Port of `metadata.tasks.ExecutionMetadata`.
 */
export const ExecutionMetadataSchema = z.object({
  serverSendTime: z.number().int().optional(),
  clientReceiveTime: z.number().int().optional(),
  executionStartTime: z.number().int().optional(),
  executionEndTime: z.number().int().optional(),
  clientSendTime: z.number().int().optional(),
  pollNetworkLatency: z.number().int().optional(),
  updateNetworkLatency: z.number().int().optional(),
  additionalContext: z.record(z.unknown()).default({}),
});

export type ExecutionMetadata = z.infer<typeof ExecutionMetadataSchema>;
