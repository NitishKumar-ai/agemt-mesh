import { z } from 'zod';

import { TaskStatus } from '../enums.js';
import { SignalResponseSchema } from './SignalResponse.js';
import { TaskDefSchema } from './TaskDef.js';
import { WorkflowTaskSchema } from './WorkflowTask.js';

/**
 * Port of `com.netflix.conductor.model.TaskModel` — the engine's internal,
 * mutable task execution record (richer than the API `Task`). Defaults mirror
 * the Java field initializers.
 */
export const TaskModelSchema = SignalResponseSchema.extend({
  taskType: z.string().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  referenceTaskName: z.string().optional(),
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
  callbackAfterMs: z.number().int().default(0),
  firstScheduledTime: z.number().int().default(0),
  workerId: z.string().optional(),
  workflowTask: WorkflowTaskSchema.optional(),
  taskDefinition: TaskDefSchema.optional(),
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
  waitTimeout: z.number().int().default(0),
  loopTaskId: z.string().optional(),
  subworkflowChanged: z.boolean().default(false),
  parentTaskId: z.string().optional(),
  idempotent: z.boolean().default(false),
  inputData: z.record(z.unknown()).default({}),
  outputData: z.record(z.unknown()).default({}),
});

export type TaskModel = z.infer<typeof TaskModelSchema>;
