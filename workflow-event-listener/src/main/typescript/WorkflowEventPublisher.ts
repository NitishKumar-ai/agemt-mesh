import { EventEmitter } from 'node:events';
import { type Workflow } from '@agentmesh/common';
import {
  WorkflowLifecycleEventName,
  type WorkflowLifecycleEvent,
  type WorkflowEventMap,
} from './WorkflowEventTypes.js';

/**
 * WorkflowEventPublisher
 *
 * A singleton-friendly, typed EventEmitter that acts as the central bus for
 * workflow lifecycle transitions.  Application layers (core engine, REST
 * controllers, test harnesses) call the typed `publish*` methods to announce
 * state changes.  One or more `WorkflowEventListener` instances subscribe to
 * this bus and forward events to persistence queues.
 *
 * Design rationale:
 *  - Using Node's built-in EventEmitter avoids a heavy external pub/sub
 *    dependency for in-process coordination.
 *  - The bus is injected into listeners as a constructor argument so that
 *    tests can instantiate an isolated publisher without global state.
 *  - TypeScript's typed EventEmitter (via the generic overload pattern) gives
 *    compile-time guarantees that each event carries the correct payload shape.
 */
export class WorkflowEventPublisher extends EventEmitter {
  /**
   * Constructs a new WorkflowEventPublisher.
   *
   * @param maxListeners - Optional override for Node's default listener
   *   warning threshold (default: 20).  Raise this value when many listener
   *   instances attach to a shared bus.
   */
  constructor(maxListeners = 20) {
    super();
    this.setMaxListeners(maxListeners);
  }

  // ---------------------------------------------------------------------------
  // Typed emit helpers
  // ---------------------------------------------------------------------------

  /**
   * Emits a typed workflow lifecycle event onto the bus.
   *
   * @param eventName - One of the WorkflowLifecycleEventName constants.
   * @param workflow  - Runtime snapshot of the workflow at transition time.
   * @param firedAtMs - Optional epoch-ms timestamp; defaults to Date.now().
   */
  private emitLifecycle(
    eventName: WorkflowLifecycleEventName,
    workflow: Workflow,
    firedAtMs = Date.now(),
  ): boolean {
    const payload: WorkflowLifecycleEvent = { eventName, workflow, firedAtMs };
    return this.emit(eventName, payload);
  }

  /**
   * Publishes a workflow:STARTED event.
   * Call this immediately after a new workflow execution is persisted and its
   * initial tasks are scheduled.
   */
  publishStarted(workflow: Workflow, firedAtMs?: number): boolean {
    return this.emitLifecycle(WorkflowLifecycleEventName.STARTED, workflow, firedAtMs);
  }

  /**
   * Publishes a workflow:COMPLETED event.
   * Call this once all tasks have reached a successful terminal state and the
   * workflow status is set to COMPLETED.
   */
  publishCompleted(workflow: Workflow, firedAtMs?: number): boolean {
    return this.emitLifecycle(WorkflowLifecycleEventName.COMPLETED, workflow, firedAtMs);
  }

  /**
   * Publishes a workflow:FAILED event.
   * Call this when the workflow transitions to FAILED due to a task failure or
   * an explicit failure request.
   */
  publishFailed(workflow: Workflow, firedAtMs?: number): boolean {
    return this.emitLifecycle(WorkflowLifecycleEventName.FAILED, workflow, firedAtMs);
  }

  /**
   * Publishes a workflow:TIMED_OUT event.
   * Call this when the workflow exceeds its configured timeout duration and is
   * moved to the TIMED_OUT terminal state.
   */
  publishTimedOut(workflow: Workflow, firedAtMs?: number): boolean {
    return this.emitLifecycle(WorkflowLifecycleEventName.TIMED_OUT, workflow, firedAtMs);
  }

  /**
   * Publishes a workflow:TERMINATED event.
   * Call this when an external caller explicitly terminates a running workflow.
   */
  publishTerminated(workflow: Workflow, firedAtMs?: number): boolean {
    return this.emitLifecycle(WorkflowLifecycleEventName.TERMINATED, workflow, firedAtMs);
  }

  /**
   * Publishes a workflow:PAUSED event.
   * Call this when a running workflow is suspended and enters the PAUSED state.
   */
  publishPaused(workflow: Workflow, firedAtMs?: number): boolean {
    return this.emitLifecycle(WorkflowLifecycleEventName.PAUSED, workflow, firedAtMs);
  }

  /**
   * Publishes a workflow:RESUMED event.
   * Call this when a paused workflow is resumed and moves back to RUNNING.
   */
  publishResumed(workflow: Workflow, firedAtMs?: number): boolean {
    return this.emitLifecycle(WorkflowLifecycleEventName.RESUMED, workflow, firedAtMs);
  }

  // ---------------------------------------------------------------------------
  // Typed on() / once() overloads
  // The EventEmitter base-class `on` / `off` / `once` signatures accept
  // `string | symbol`.  We provide narrowly-typed overloads so callers get
  // correct payload types when subscribing to known event names.
  // ---------------------------------------------------------------------------

  override on<K extends WorkflowLifecycleEventName>(
    eventName: K,
    listener: (...args: WorkflowEventMap[K]) => void,
  ): this;
  override on(eventName: string | symbol, listener: (...args: unknown[]) => void): this;
  override on(eventName: string | symbol, listener: (...args: unknown[]) => void): this {
    return super.on(eventName, listener);
  }

  override once<K extends WorkflowLifecycleEventName>(
    eventName: K,
    listener: (...args: WorkflowEventMap[K]) => void,
  ): this;
  override once(eventName: string | symbol, listener: (...args: unknown[]) => void): this;
  override once(eventName: string | symbol, listener: (...args: unknown[]) => void): this {
    return super.once(eventName, listener);
  }

  override off<K extends WorkflowLifecycleEventName>(
    eventName: K,
    listener: (...args: WorkflowEventMap[K]) => void,
  ): this;
  override off(eventName: string | symbol, listener: (...args: unknown[]) => void): this;
  override off(eventName: string | symbol, listener: (...args: unknown[]) => void): this {
    return super.off(eventName, listener);
  }
}
