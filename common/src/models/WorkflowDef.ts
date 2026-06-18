import { z } from 'zod';

import { WorkflowTimeoutPolicy } from '../enums.js';
import { AuditableSchema } from './Auditable.js';
import { CacheConfigSchema } from './CacheConfig.js';
import { RateLimitConfigSchema } from './RateLimitConfig.js';
import { SchemaDefSchema } from './SchemaDef.js';
import { WorkflowTaskSchema } from './WorkflowTask.js';
import { stripNullsDeep } from '../utils/json.js';

/**
 * Port of `metadata.workflow.WorkflowDef`. Defaults mirror the Java field
 * initializers (e.g. version=1, schemaVersion=2, restartable=true,
 * timeoutPolicy=ALERT_ONLY, enforceSchema=true).
 */
const WorkflowDefObject = AuditableSchema.extend({
  name: z.string(),
  description: z.string().optional(),
  version: z.number().int().default(1),
  tasks: z.array(WorkflowTaskSchema).default([]),
  inputParameters: z.array(z.string()).default([]),
  outputParameters: z.record(z.unknown()).default({}),
  failureWorkflow: z.string().optional(),
  schemaVersion: z.number().int().default(2),
  restartable: z.boolean().default(true),
  workflowStatusListenerEnabled: z.boolean().default(false),
  ownerEmail: z.string().optional(),
  timeoutPolicy: z.nativeEnum(WorkflowTimeoutPolicy).default(WorkflowTimeoutPolicy.ALERT_ONLY),
  timeoutSeconds: z.number().int().default(0),
  variables: z.record(z.unknown()).default({}),
  inputTemplate: z.record(z.unknown()).default({}),
  workflowStatusListenerSink: z.string().optional(),
  rateLimitConfig: RateLimitConfigSchema.optional(),
  inputSchema: SchemaDefSchema.optional(),
  outputSchema: SchemaDefSchema.optional(),
  enforceSchema: z.boolean().default(true),
  metadata: z.record(z.unknown()).default({}),
  cacheConfig: CacheConfigSchema.optional(),
  maskedFields: z.array(z.string()).default([]),
});

/** Null-tolerant entry schema (Java emits `null` for unset optionals). */
export const WorkflowDefSchema = z.preprocess(stripNullsDeep, WorkflowDefObject);

export type WorkflowDef = z.infer<typeof WorkflowDefObject>;

/** Java `WorkflowDef.getKey()` — "name.version", the metadata store key. */
export function workflowDefKey(name: string, version: number): string {
  return `${name}.${version}`;
}
