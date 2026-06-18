import { z } from 'zod';

/**
 * Port of `metadata.tasks.PollData`.
 */
export const PollDataSchema = z.object({
  queueName: z.string().optional(),
  domain: z.string().optional(),
  workerId: z.string().optional(),
  lastPollTime: z.number().int().default(0),
});

export type PollData = z.infer<typeof PollDataSchema>;
