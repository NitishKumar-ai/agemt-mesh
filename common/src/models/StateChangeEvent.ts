import { z } from 'zod';

/** Port of `metadata.workflow.StateChangeEvent`. */
export const StateChangeEventSchema = z.object({
  type: z.string(),
  payload: z.record(z.unknown()).optional(),
});

export type StateChangeEvent = z.infer<typeof StateChangeEventSchema>;
