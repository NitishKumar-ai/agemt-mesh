import { z } from 'zod';

export const MessageSchema = z.object({
  id: z.string().optional(),
  payload: z.string().optional(),
  receipt: z.string().optional(),
  priority: z.number().int().default(0),
  timeout: z.number().int().default(0),
});

export type Message = z.infer<typeof MessageSchema>;
