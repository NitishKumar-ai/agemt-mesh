import { z } from 'zod';

import { TaskStatus } from '../enums.js';
import { ExecutionMetadataSchema } from './ExecutionMetadata.js';
import { WorkflowTaskSchema } from './WorkflowTask.js';

/**
 * Port of `metadata.tasks.Task` (runtime instance).
 */
export const TaskSchema = z.object({
  taskType: z.string(),
  status: z.nativeEnum(TaskStatus),
  inputData: z.record(z.unknown()).default({}),
  referenceTaskName: z.string(),
  retryCount: z.number().int().default(0),
  seq: z.number().int().default(0),
  correlationId: z.string().optional(),
  pollCount: z.number().int().default(0),
  taskDefName: z.string().optional(),
  scheduledTime: z.number().int().default(0),
  startTime: z.number().int().default(0),
  endTime: z.number().int().default(0),
  updateTime: z.number().int().default(0),
  startDelayInSeconds: z.number().int().default(0),
  retriedTaskId: z.string().optional(),
  retried: z.boolean().default(false),
  executed: z.boolean().default(false),
  callbackFromWorker: z.boolean().default(true),
  responseTimeoutSeconds: z.number().int().default(0),
  workflowInstanceId: z.string().optional(),
  workflowType: z.string().optional(),
  taskId: z.string().optional(),
  reasonForIncompletion: z.string().optional(),
  callbackAfterSeconds: z.number().int().default(0),
  workerId: z.string().optional(),
  outputData: z.record(z.unknown()).default({}),
  workflowTask: WorkflowTaskSchema.optional(),
  domain: z.string().optional(),
  rateLimitPerFrequency: z.number().int().default(0),
  rateLimitFrequencyInSeconds: z.number().int().default(0),
  externalInputPayloadStoragePath: z.string().optional(),
  externalOutputPayloadStoragePath: z.string().optional(),
  workflowPriority: z.number().int().default(0),
  executionNameSpace: z.string().optional(),
  isolationGroupId: z.string().optional(),
  iteration: z.number().int().default(0),
  subWorkflowId: z.string().optional(),
  subworkflowChanged: z.boolean().default(false),
  firstStartTime: z.number().int().default(0),
  executionMetadata: ExecutionMetadataSchema.optional(),
  parentTaskId: z.string().optional(),
});

export type Task = z.infer<typeof TaskSchema>;
