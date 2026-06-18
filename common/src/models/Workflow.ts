import { z } from 'zod';

import { WorkflowStatus } from '../enums.js';
import { type Auditable, AuditableSchema } from './Auditable.js';
import { type Task, TaskSchema } from './Task.js';
import { type WorkflowDef, WorkflowDefSchema } from './WorkflowDef.js';
import { stripNullsDeep } from '../utils/json.js';

/**
 * Port of `run.Workflow` (runtime instance).
 *
 * Modeled as an interface + lazy schema to handle the circular `history` field.
 */
export interface Workflow extends Auditable {
  status: WorkflowStatus;
  endTime: number;
  workflowId: string;
  parentWorkflowId?: string;
  parentWorkflowTaskId?: string;
  tasks: Task[];
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  correlationId?: string;
  reRunFromWorkflowId?: string;
  reasonForIncompletion?: string;
  event?: string;
  taskToDomain: Record<string, string>;
  // Java `Set<String>` serializes to a JSON array; model as string[] for wire parity.
  failedReferenceTaskNames: string[];
  workflowDefinition?: WorkflowDef;
  externalInputPayloadStoragePath?: string;
  externalOutputPayloadStoragePath?: string;
  priority: number;
  variables: Record<string, unknown>;
  lastRetriedTime: number;
  failedTaskNames: string[];
  history: Workflow[];
  idempotencyKey?: string;
  rateLimitKey?: string;
  rateLimited: boolean;
}

export const WorkflowSchema: z.ZodType<Workflow, z.ZodTypeDef, unknown> = z.preprocess(
  stripNullsDeep,
  z.lazy(() =>
    AuditableSchema.extend({
      status: z.nativeEnum(WorkflowStatus).default(WorkflowStatus.RUNNING),
      endTime: z.number().int().default(0),
      workflowId: z.string(),
      parentWorkflowId: z.string().optional(),
      parentWorkflowTaskId: z.string().optional(),
      tasks: z.array(TaskSchema).default([]),
      input: z.record(z.unknown()).default({}),
      output: z.record(z.unknown()).default({}),
      correlationId: z.string().optional(),
      reRunFromWorkflowId: z.string().optional(),
      reasonForIncompletion: z.string().optional(),
      event: z.string().optional(),
      taskToDomain: z.record(z.string()).default({}),
      failedReferenceTaskNames: z.array(z.string()).default([]),
      workflowDefinition: WorkflowDefSchema.optional(),
      externalInputPayloadStoragePath: z.string().optional(),
      externalOutputPayloadStoragePath: z.string().optional(),
      priority: z.number().int().min(0).max(99).default(0),
      variables: z.record(z.unknown()).default({}),
      lastRetriedTime: z.number().int().default(0),
      failedTaskNames: z.array(z.string()).default([]),
      history: z.array(WorkflowSchema).default([]),
      idempotencyKey: z.string().optional(),
      rateLimitKey: z.string().optional(),
      rateLimited: z.boolean().default(false),
    }),
  ),
);
