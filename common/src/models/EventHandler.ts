import { z } from 'zod';

import { EventActionType } from '../enums.js';

export const TaskDetailsSchema = z.object({
  workflowId: z.string().optional(),
  taskRefName: z.string().optional(),
  output: z.record(z.any()).default({}),
  taskId: z.string().optional(),
  reasonForIncompletion: z.string().optional(),
});

export type TaskDetails = z.infer<typeof TaskDetailsSchema>;

export const StartWorkflowSchema = z.object({
  name: z.string().optional(),
  version: z.number().int().optional(),
  correlationId: z.string().optional(),
  input: z.record(z.any()).default({}),
  taskToDomain: z.record(z.string()).optional(),
});

export type StartWorkflow = z.infer<typeof StartWorkflowSchema>;

export const TerminateWorkflowSchema = z.object({
  workflowId: z.string().optional(),
  terminationReason: z.string().optional(),
});

export type TerminateWorkflow = z.infer<typeof TerminateWorkflowSchema>;

export const UpdateWorkflowVariablesSchema = z.object({
  workflowId: z.string().optional(),
  variables: z.record(z.any()).optional(),
  appendArray: z.boolean().optional(),
});

export type UpdateWorkflowVariables = z.infer<typeof UpdateWorkflowVariablesSchema>;

export const EventHandlerActionSchema = z.object({
  action: z.nativeEnum(EventActionType).optional(),
  start_workflow: StartWorkflowSchema.optional(),
  complete_task: TaskDetailsSchema.optional(),
  fail_task: TaskDetailsSchema.optional(),
  expandInlineJSON: z.boolean().default(false),
  terminate_workflow: TerminateWorkflowSchema.optional(),
  update_workflow_variables: UpdateWorkflowVariablesSchema.optional(),
});

export type EventHandlerAction = z.infer<typeof EventHandlerActionSchema>;

export const EventHandlerSchema = z.object({
  name: z.string().min(1, 'Missing event handler name'),
  event: z.string().min(1, 'Missing event location'),
  condition: z.string().optional(),
  actions: z.array(EventHandlerActionSchema).min(1, 'No actions specified. Please specify at-least one action'),
  active: z.boolean().default(true),
  evaluatorType: z.string().optional(),
});

export type EventHandler = z.infer<typeof EventHandlerSchema>;
