import type { TaskStatus } from '@agentmesh/common';

/**
 * Configuration for TaskStatusListener.
 *
 * Controls which task statuses trigger queue publications, the queue-name
 * derivation strategy, and optional publish-error handling.
 */
export interface TaskStatusListenerConfig {
  /**
   * Set of TaskStatus values that should trigger a publication to the queue.
   *
   * When omitted, all status transitions are published. Supply a subset to
   * reduce noise — for example only terminal states:
   *   ['COMPLETED', 'FAILED', 'TIMED_OUT', 'CANCELED']
   */
  readonly publishedStatuses?: ReadonlyArray<TaskStatus>;

  /**
   * Derives the target queue name from a task reference name and its status.
   *
   * Defaults to `task_status_<taskRefName>_<status>` when not provided.
   *
   * @param taskRefName - The task's referenceTaskName field.
   * @param status      - The new TaskStatus value.
   * @returns The queue name string to publish to.
   */
  readonly queueNameResolver?: (taskRefName: string, status: string) => string;

  /**
   * Optional hook called when a publish operation fails.
   *
   * If not set, errors are re-thrown and bubble up to the caller that emitted
   * the task event.
   *
   * @param error       - The error thrown by the QueueDAO.
   * @param taskRefName - The task reference name involved.
   * @param status      - The status that was being published.
   */
  readonly onPublishError?: (error: unknown, taskRefName: string, status: string) => void;
}
