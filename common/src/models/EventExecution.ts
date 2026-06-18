import { z } from 'zod';
import { EventExecutionStatus, EventActionType } from '../enums.js';

export const EventExecutionSchema = z.object({
  id: z.string().optional(),
  messageId: z.string().optional(),
  name: z.string().optional(),
  event: z.string().optional(),
  created: z.number().int().default(0),
  status: z.nativeEnum(EventExecutionStatus).optional(),
  action: z.nativeEnum(EventActionType).optional(),
  output: z.record(z.any()).default({}),
});

export type EventExecution = z.infer<typeof EventExecutionSchema>;
