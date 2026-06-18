import { z } from 'zod';

import { JoinMode, TaskType } from '../enums.js';
import { CacheConfigSchema, type CacheConfig } from './CacheConfig.js';
import { StateChangeEventSchema, type StateChangeEvent } from './StateChangeEvent.js';
import { SubWorkflowParamsSchema, type SubWorkflowParams } from './SubWorkflowParams.js';
import { TaskDefSchema, type TaskDef } from './TaskDef.js';

/**
 * Port of `metadata.workflow.WorkflowTask`.
 *
 * The task tree (decisionCases / defaultCase / forkTasks / loopOver) is modeled
 * faithfully and recursively, and the leaf config objects (subWorkflowParam,
 * cacheConfig, onStateChange, joinMode) are fully typed.
 */
export interface WorkflowTask {
  name: string;
  taskReferenceName: string;
  description?: string;
  inputParameters: Record<string, unknown>;
  type: string;
  dynamicTaskNameParam?: string;
  caseValueParam?: string;
  caseExpression?: string;
  scriptExpression?: string;
  decisionCases: Record<string, WorkflowTask[]>;
  /** @deprecated use dynamicForkTasksParam */
  dynamicForkJoinTasksParam?: string;
  dynamicForkTasksParam?: string;
  dynamicForkTasksInputParamName?: string;
  defaultCase: WorkflowTask[];
  forkTasks: WorkflowTask[][];
  startDelay: number;
  subWorkflowParam?: SubWorkflowParams;
  joinOn: string[];
  sink?: string;
  optional: boolean;
  taskDefinition?: TaskDef;
  rateLimited?: boolean;
  defaultExclusiveJoinTask: string[];
  asyncComplete: boolean;
  loopCondition?: string;
  loopOver: WorkflowTask[];
  items?: string;
  retryCount?: number;
  evaluatorType?: string;
  expression?: string;
  onStateChange: Record<string, StateChangeEvent[]>;
  joinStatus?: string;
  cacheConfig?: CacheConfig;
  permissive: boolean;
  joinMode?: JoinMode;
}

// Input is `unknown` (we parse untrusted JSON); output is the fully-defaulted
// WorkflowTask. The split is required because `.default()` makes input fields
// optional while the output keeps them required.
export const WorkflowTaskSchema: z.ZodType<WorkflowTask, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    name: z.string(),
    taskReferenceName: z.string(),
    description: z.string().optional(),
    inputParameters: z.record(z.unknown()).default({}),
    type: z.string().default(TaskType.SIMPLE),
    dynamicTaskNameParam: z.string().optional(),
    caseValueParam: z.string().optional(),
    caseExpression: z.string().optional(),
    scriptExpression: z.string().optional(),
    decisionCases: z.record(z.array(WorkflowTaskSchema)).default({}),
    dynamicForkJoinTasksParam: z.string().optional(),
    dynamicForkTasksParam: z.string().optional(),
    dynamicForkTasksInputParamName: z.string().optional(),
    defaultCase: z.array(WorkflowTaskSchema).default([]),
    forkTasks: z.array(z.array(WorkflowTaskSchema)).default([]),
    startDelay: z.number().int().default(0),
    subWorkflowParam: SubWorkflowParamsSchema.optional(),
    joinOn: z.array(z.string()).default([]),
    sink: z.string().optional(),
    optional: z.boolean().default(false),
    taskDefinition: TaskDefSchema.optional(),
    rateLimited: z.boolean().optional(),
    defaultExclusiveJoinTask: z.array(z.string()).default([]),
    asyncComplete: z.boolean().default(false),
    loopCondition: z.string().optional(),
    loopOver: z.array(WorkflowTaskSchema).default([]),
    items: z.string().optional(),
    retryCount: z.number().int().optional(),
    evaluatorType: z.string().optional(),
    expression: z.string().optional(),
    onStateChange: z.record(z.array(StateChangeEventSchema)).default({}),
    joinStatus: z.string().optional(),
    cacheConfig: CacheConfigSchema.optional(),
    permissive: z.boolean().default(false),
    joinMode: z.nativeEnum(JoinMode).optional(),
  }),
);
