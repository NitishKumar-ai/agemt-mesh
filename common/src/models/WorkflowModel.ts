import { z } from 'zod';

import { WorkflowStatus } from '../enums.js';
import { SignalResponseSchema } from './SignalResponse.js';
import { TaskModelSchema } from './TaskModel.js';

/**
 * Port of `org.conductoross.conductor.model.WorkflowRun`.
 * Mentioned as `WorkflowModel` in the Transformation Plan.
 */
export const WorkflowModelSchema = SignalResponseSchema.extend({
  workflowName: z.string().optional(),
  /** Serialized wire alias for the workflow's definition name (see completed.json fixture). */
  workflowType: z.string().optional(),
  workflowVersion: z.number().int().optional(),
  priority: z.number().int().default(0),
  variables: z.record(z.unknown()).default({}),
  tasks: z.array(TaskModelSchema).default([]),
  createdBy: z.string().optional(),
  createTime: z.number().int().default(0),
  status: z.nativeEnum(WorkflowStatus).optional(),
  updateTime: z.number().int().default(0),
});

export type WorkflowModel = z.infer<typeof WorkflowModelSchema>;
