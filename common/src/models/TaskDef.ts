import { z } from 'zod';

import { RetryLogic, TaskTimeoutPolicy } from '../enums.js';
import { AuditableSchema } from './Auditable.js';
import { SchemaDefSchema } from './SchemaDef.js';

/** One hour in seconds — Java `TaskDef.ONE_HOUR`, the `responseTimeoutSeconds` default. */
export const ONE_HOUR = 60 * 60;

/**
 * Port of `metadata.tasks.TaskDef`. Defaults mirror the Java field initializers
 * exactly so a `parse({ name })` yields the same effective definition.
 */
export const TaskDefSchema = AuditableSchema.extend({
  name: z.string().min(1, 'TaskDef name cannot be null or empty'),
  description: z.string().optional(),
  retryCount: z.number().int().default(3),
  timeoutSeconds: z.number().int().default(0),
  inputKeys: z.array(z.string()).default([]),
  outputKeys: z.array(z.string()).default([]),
  timeoutPolicy: z.nativeEnum(TaskTimeoutPolicy).default(TaskTimeoutPolicy.TIME_OUT_WF),
  retryLogic: z.nativeEnum(RetryLogic).default(RetryLogic.FIXED),
  retryDelaySeconds: z.number().int().default(60),
  responseTimeoutSeconds: z.number().int().default(ONE_HOUR),
  concurrentExecLimit: z.number().int().optional(),
  inputTemplate: z.record(z.unknown()).default({}),
  rateLimitPerFrequency: z.number().int().optional(),
  rateLimitFrequencyInSeconds: z.number().int().optional(),
  isolationGroupId: z.string().optional(),
  executionNameSpace: z.string().optional(),
  ownerEmail: z.string().optional(),
  pollTimeoutSeconds: z.number().int().optional(),
  backoffScaleFactor: z.number().int().default(1),
  maxRetryDelaySeconds: z.number().int().default(0),
  backoffJitterMs: z.number().int().default(0),
  baseType: z.string().optional(),
  totalTimeoutSeconds: z.number().int().default(0),
  taskStatusListenerEnabled: z.boolean().default(true),
  inputSchema: SchemaDefSchema.optional(),
  outputSchema: SchemaDefSchema.optional(),
  enforceSchema: z.boolean().default(false),
});

export type TaskDef = z.infer<typeof TaskDefSchema>;
