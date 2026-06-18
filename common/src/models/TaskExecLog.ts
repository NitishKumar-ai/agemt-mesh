import { z } from 'zod';

export const TaskExecLogSchema = z.object({
  log: z.string(),
  taskId: z.string().optional(),
  createdTime: z.number().int().default(0),
});

export type TaskExecLog = z.infer<typeof TaskExecLogSchema>;
