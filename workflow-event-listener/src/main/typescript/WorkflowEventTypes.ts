import { type Workflow } from '@agentmesh/common';

/**
 * Enumeration of workflow lifecycle event names that this module emits and
 * consumes. The values are stable string literals and are used both as Node.js
 * EventEmitter event names and as the `event` field on published
 * EventExecution objects.
 *
 * These correspond directly to the Java-side
 * `WorkflowStatusListener` / `WorkflowEventQueueMonitor` event names.
 */
export const WorkflowLifecycleEventName = {
  STARTED: 'workflow:STARTED',
  COMPLETED: 'workflow:COMPLETED',
  FAILED: 'workflow:FAILED',
  TIMED_OUT: 'workflow:TIMED_OUT',
  TERMINATED: 'workflow:TERMINATED',
  PAUSED: 'workflow:PAUSED',
  RESUMED: 'workflow:RESUMED',
} as const;

export type WorkflowLifecycleEventName =
  (typeof WorkflowLifecycleEventName)[keyof typeof WorkflowLifecycleEventName];

/**
 * Payload carried by every workflow lifecycle event.  Callers always supply
 * the full runtime Workflow snapshot at the moment the transition occurs so
 * that listeners can derive any additional metadata without hitting the
 * persistence layer.
 */
export interface WorkflowLifecycleEvent {
  /** The stable event-name string (e.g. "workflow:COMPLETED"). */
  readonly eventName: WorkflowLifecycleEventName;

  /**
   * The workflow runtime snapshot captured at the moment the event was fired.
   * Downstream listeners must treat this value as read-only.
   */
  readonly workflow: Workflow;

  /**
   * Wall-clock timestamp (Unix ms) at which the event was fired.
   * Defaults to Date.now() if not provided by the emitting call-site.
   */
  readonly firedAtMs: number;
}

/**
 * Typed event map consumed by Node's EventEmitter.  Each key is one of the
 * WorkflowLifecycleEventName constants; the value is a single-argument tuple
 * containing the structured event payload.
 */
export type WorkflowEventMap = {
  [K in WorkflowLifecycleEventName]: [event: WorkflowLifecycleEvent];
};
