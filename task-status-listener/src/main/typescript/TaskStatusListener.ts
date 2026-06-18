import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

import type { QueueDAO } from '@agentmesh/common-persistence';
import { type Task, type EventExecution, EventExecutionStatus, TaskStatus } from '@agentmesh/common';

import type { TaskStatusListenerConfig } from './TaskStatusListenerConfig.js';

/**
 * The payload carried by every 'taskStatusChanged' event.
 *
 * Callers construct this object and pass it to
 * `TaskStatusListener.emit('taskStatusChanged', event)`.
 */
export interface TaskStatusChangedEvent {
  /** The full task snapshot at the moment the status changed. */
  readonly task: Task;
  /**
   * The previous status, when known. May be undefined for initial SCHEDULED
   * transitions where no prior state is available.
   */
  readonly previousStatus?: TaskStatus;
}

/**
 * Typed event-map for TaskStatusListener.
 *
 * Extending EventEmitter with a typed interface keeps call-sites type-safe and
 * avoids stringly-typed `emit` / `on` calls.
 */
export interface TaskStatusListenerEvents {
  taskStatusChanged: [event: TaskStatusChangedEvent];
}

/**
 * Default queue-name resolver.
 *
 * Produces names of the form: `task_status_<taskRefName>_<status>`
 * which are predictable, human-readable, and consistent across services.
 */
function defaultQueueNameResolver(taskRefName: string, status: string): string {
  return `task_status_${taskRefName}_${status}`;
}

/**
 * TaskStatusListener
 *
 * Listens to task lifecycle events emitted via the EventEmitter API and
 * publishes a corresponding `EventExecution` record to a `QueueDAO` for
 * downstream consumers (audit trails, monitoring dashboards, reactive
 * workflow triggers, etc.).
 *
 * Design overview
 * ---------------
 * - Extends Node's `EventEmitter` so that any part of the application can
 *   attach handlers or emit events without tight coupling.
 * - Each `taskStatusChanged` event translates to a single `QueueDAO.push`
 *   call. The target queue name is derived by the configurable
 *   `queueNameResolver` function.
 * - An `EventExecution` envelope is serialised to JSON and stored as the
 *   `Message.payload` so that consumers receive a self-describing record.
 * - The class tracks the set of statuses it should publish. Transitions that
 *   are not in the configured allow-list are silently ignored.
 *
 * Usage
 * -----
 * ```ts
 * const listener = new TaskStatusListener(queueDAO, {
 *   publishedStatuses: ['COMPLETED', 'FAILED', 'TIMED_OUT', 'CANCELED'],
 * });
 * listener.start();
 *
 * // Later, from workflow execution logic:
 * listener.emit('taskStatusChanged', { task, previousStatus });
 *
 * // On shutdown:
 * await listener.stop();
 * ```
 */
export class TaskStatusListener extends EventEmitter<TaskStatusListenerEvents> {
  private readonly dao: QueueDAO;
  private readonly config: Required<
    Omit<TaskStatusListenerConfig, 'publishedStatuses' | 'onPublishError'>
  > & {
    publishedStatuses: ReadonlySet<string> | null;
    onPublishError: ((error: unknown, taskRefName: string, status: string) => void) | null;
  };

  /** Whether the listener is currently active and processing events. */
  private running: boolean = false;

  /**
   * @param dao    - The QueueDAO implementation used for publishing messages.
   * @param config - Optional configuration overrides.
   */
  constructor(dao: QueueDAO, config: TaskStatusListenerConfig = {}) {
    super();

    this.dao = dao;
    this.config = {
      queueNameResolver: config.queueNameResolver ?? defaultQueueNameResolver,
      publishedStatuses:
        config.publishedStatuses != null ? new Set(config.publishedStatuses) : null,
      onPublishError: config.onPublishError ?? null,
    };
  }

  /**
   * Activates the listener.
   *
   * Attaches the internal `taskStatusChanged` handler so that subsequent emit
   * calls are processed. Calling `start()` on an already-running instance is a
   * no-op.
   */
  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.on('taskStatusChanged', this.handleTaskStatusChanged);
  }

  /**
   * Deactivates the listener.
   *
   * Removes the internal `taskStatusChanged` handler. Already-in-flight
   * publishes are not cancelled. Calling `stop()` on a stopped instance is a
   * no-op.
   */
  stop(): void {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.off('taskStatusChanged', this.handleTaskStatusChanged);
  }

  /**
   * Internal handler bound to the 'taskStatusChanged' event.
   *
   * Determines whether the status transition should be published and, if so,
   * calls `publishTaskStatus`. Errors are routed to `onPublishError` when
   * configured; otherwise they propagate.
   */
  private handleTaskStatusChanged = (event: TaskStatusChangedEvent): void => {
    const { task } = event;
    const status = task.status;
    const taskRefName = task.referenceTaskName;

    // Filter by the configured allow-list when one is present.
    if (this.config.publishedStatuses !== null && !this.config.publishedStatuses.has(status)) {
      return;
    }

    // Intentionally fire-and-forget: the caller is synchronous (EventEmitter
    // cannot await handlers). Errors surface via onPublishError or a thrown
    // unhandled rejection.
    this.publishTaskStatus(task, taskRefName, status).catch((error: unknown) => {
      if (this.config.onPublishError !== null) {
        this.config.onPublishError(error, taskRefName, status);
      } else {
        // Re-emit as an 'error' event so that Node.js's default error handling
        // takes over (prints and exits) unless the caller has an 'error' listener.
        this.emit('error' as keyof TaskStatusListenerEvents, error as TaskStatusChangedEvent);
      }
    });
  };

  /**
   * Constructs an `EventExecution` envelope for the given task status
   * transition and pushes it onto the target queue.
   *
   * Queue-name derivation:
   *   `queueNameResolver(taskRefName, status)` — defaults to
   *   `task_status_<taskRefName>_<status>`.
   *
   * The `EventExecution` fields are mapped as follows:
   * - `id`        — a fresh UUID for idempotency tracking.
   * - `messageId` — the task's taskId when available.
   * - `name`      — the task definition name (taskDefName or taskType).
   * - `event`     — `task_status_<status>` (a stable symbolic event name).
   * - `created`   — current epoch milliseconds.
   * - `status`    — IN_PROGRESS for transient states; COMPLETED for terminal
   *                 successful states; FAILED for terminal failure states.
   * - `output`    — full task snapshot serialised to a plain object.
   *
   * @param task        - The task whose status changed.
   * @param taskRefName - The task reference name (queue routing key).
   * @param status      - The new TaskStatus value.
   */
  private async publishTaskStatus(
    task: Task,
    taskRefName: string,
    status: string,
  ): Promise<void> {
    const queueName = this.config.queueNameResolver(taskRefName, status);
    const executionId = randomUUID();

    const execution: EventExecution = {
      id: executionId,
      messageId: task.taskId,
      name: task.taskDefName ?? task.taskType,
      event: `task_status_${status}`,
      created: Date.now(),
      status: mapTaskStatusToExecutionStatus(status),
      action: undefined,
      output: buildTaskSnapshot(task),
    };

    // Offset of 0 means the message is immediately eligible for consumption.
    // Priority mirrors the task's workflow-level priority for correct ordering.
    await this.dao.push(queueName, executionId, 0, task.workflowPriority);
  }
}

/**
 * Maps a raw TaskStatus string to the nearest EventExecutionStatus.
 *
 * Mapping rationale:
 * - COMPLETED / COMPLETED_WITH_ERRORS / SKIPPED => COMPLETED
 * - FAILED / FAILED_WITH_TERMINAL_ERROR / TIMED_OUT / CANCELED => FAILED
 * - SCHEDULED / IN_PROGRESS => IN_PROGRESS (still executing)
 */
function mapTaskStatusToExecutionStatus(status: string): EventExecutionStatus {
  switch (status) {
    case TaskStatus.COMPLETED:
    case TaskStatus.COMPLETED_WITH_ERRORS:
    case TaskStatus.SKIPPED:
      return EventExecutionStatus.COMPLETED;

    case TaskStatus.FAILED:
    case TaskStatus.FAILED_WITH_TERMINAL_ERROR:
    case TaskStatus.TIMED_OUT:
    case TaskStatus.CANCELED:
      return EventExecutionStatus.FAILED;

    case TaskStatus.SCHEDULED:
    case TaskStatus.IN_PROGRESS:
    default:
      return EventExecutionStatus.IN_PROGRESS;
  }
}

/**
 * Serialises the task fields that are safe and useful to carry in the queue
 * message payload. Avoids circular references and strips undefined values.
 *
 * Consumer services can use these fields for observability, alerting, or
 * automated remediation without needing to query the execution store.
 */
function buildTaskSnapshot(task: Task): Record<string, unknown> {
  return {
    taskId: task.taskId,
    taskType: task.taskType,
    taskDefName: task.taskDefName,
    referenceTaskName: task.referenceTaskName,
    workflowInstanceId: task.workflowInstanceId,
    workflowType: task.workflowType,
    status: task.status,
    retryCount: task.retryCount,
    scheduledTime: task.scheduledTime,
    startTime: task.startTime,
    endTime: task.endTime,
    updateTime: task.updateTime,
    reasonForIncompletion: task.reasonForIncompletion,
    correlationId: task.correlationId,
    workflowPriority: task.workflowPriority,
    domain: task.domain,
    workerId: task.workerId,
    outputData: task.outputData,
  };
}
