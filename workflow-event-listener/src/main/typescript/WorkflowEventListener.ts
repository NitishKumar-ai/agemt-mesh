import { type QueueDAO } from '@agentmesh/common-persistence';
import { type EventExecution, EventExecutionStatus, EventActionType } from '@agentmesh/common';
import { type WorkflowEventPublisher } from './WorkflowEventPublisher.js';
import { WorkflowLifecycleEventName, type WorkflowLifecycleEvent } from './WorkflowEventTypes.js';

/**
 * Configuration options for WorkflowEventListener.
 */
export interface WorkflowEventListenerOptions {
  /**
   * Name of the queue to which EventExecution objects are published.
   * Defaults to "workflow_events" when not supplied.
   */
  queueName?: string | undefined;

  /**
   * Offset in seconds before the message becomes visible to consumers.
   * A value of 0 (default) makes messages immediately visible.
   */
  offsetTimeInSeconds?: number | undefined;

  /**
   * Priority assigned to each queued message (0 = normal, higher = elevated).
   * Defaults to 0.
   */
  priority?: number | undefined;

  /**
   * Whether to subscribe to PAUSED / RESUMED events in addition to the five
   * terminal-direction transitions (STARTED, COMPLETED, FAILED, TIMED_OUT,
   * TERMINATED).  Defaults to false.
   */
  includePauseResumeEvents?: boolean | undefined;
}

/**
 * WorkflowEventListener
 *
 * Bridges the in-process WorkflowEventPublisher bus with a persistent
 * QueueDAO.  For every workflow lifecycle event received it:
 *
 *  1. Constructs an EventExecution record that captures the event name,
 *     workflow ID, and current wall-clock time.
 *  2. Serialises the workflow snapshot into the EventExecution output map.
 *  3. Pushes the resulting EventExecution as a JSON-encoded Message onto
 *     the configured QueueDAO queue so that downstream consumers (e.g.
 *     notification services, audit logs) can process it asynchronously.
 *
 * Error handling strategy:
 *  - A failure to push to the queue is logged but does NOT bubble up as an
 *    exception.  This is intentional: workflow processing must not be
 *    interrupted by a queue connectivity issue.  Operators should monitor
 *    queue consumer lag and dead-letter queues for persistent failures.
 *
 * Lifecycle:
 *  - Call `start()` once to attach all event listeners to the publisher bus.
 *  - Call `stop()` to detach all listeners (useful in tests and graceful
 *    shutdown paths).
 */
export class WorkflowEventListener {
  private readonly publisher: WorkflowEventPublisher;
  private readonly queueDAO: QueueDAO;
  private readonly queueName: string;
  private readonly offsetTimeInSeconds: number;
  private readonly priority: number;
  private readonly includePauseResumeEvents: boolean;

  /** Bound handler references stored so `stop()` can remove the exact same function. */
  private readonly handlers = new Map<
    WorkflowLifecycleEventName,
    (event: WorkflowLifecycleEvent) => void
  >();

  private running = false;

  /**
   * Creates a new WorkflowEventListener.
   *
   * @param publisher - The shared WorkflowEventPublisher bus to subscribe to.
   * @param queueDAO  - The QueueDAO implementation that will receive published events.
   * @param options   - Optional tuning parameters (queue name, priority, etc.).
   */
  constructor(
    publisher: WorkflowEventPublisher,
    queueDAO: QueueDAO,
    options: WorkflowEventListenerOptions = {},
  ) {
    this.publisher = publisher;
    this.queueDAO = queueDAO;
    this.queueName = options.queueName ?? 'workflow_events';
    this.offsetTimeInSeconds = options.offsetTimeInSeconds ?? 0;
    this.priority = options.priority ?? 0;
    this.includePauseResumeEvents = options.includePauseResumeEvents ?? false;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle management
  // ---------------------------------------------------------------------------

  /**
   * Attaches all configured lifecycle listeners to the publisher bus.
   * Calling start() more than once is safe — subsequent calls are no-ops.
   */
  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;

    // Core lifecycle events always subscribed.
    const coreEvents: WorkflowLifecycleEventName[] = [
      WorkflowLifecycleEventName.STARTED,
      WorkflowLifecycleEventName.COMPLETED,
      WorkflowLifecycleEventName.FAILED,
      WorkflowLifecycleEventName.TIMED_OUT,
      WorkflowLifecycleEventName.TERMINATED,
    ];

    // Pause/resume events are optional based on caller preference.
    const optionalEvents: WorkflowLifecycleEventName[] = this.includePauseResumeEvents
      ? [WorkflowLifecycleEventName.PAUSED, WorkflowLifecycleEventName.RESUMED]
      : [];

    for (const eventName of [...coreEvents, ...optionalEvents]) {
      const handler = (event: WorkflowLifecycleEvent) => {
        // Fire-and-forget: the async handler runs without blocking the emitter.
        void this.handleEvent(event);
      };
      this.handlers.set(eventName, handler);
      this.publisher.on(eventName, handler);
    }
  }

  /**
   * Detaches all listeners from the publisher bus.
   * After stop() returns, no further queue pushes will occur from this
   * listener instance.  Calling stop() on an already-stopped listener is safe.
   */
  stop(): void {
    if (!this.running) {
      return;
    }
    this.running = false;

    for (const [eventName, handler] of this.handlers) {
      this.publisher.off(eventName, handler);
    }
    this.handlers.clear();
  }

  // ---------------------------------------------------------------------------
  // Internal processing
  // ---------------------------------------------------------------------------

  /**
   * Processes a single WorkflowLifecycleEvent by building an EventExecution
   * record and pushing it to the queue.
   *
   * The EventExecution fields are mapped as follows:
   *  - id          → "<workflowId>:<eventName>" for idempotent de-duplication
   *  - messageId   → workflowId
   *  - name        → workflowDefinitionName (or workflowId as fallback)
   *  - event       → the lifecycle event name string
   *  - created     → firedAtMs cast to seconds for wire compatibility
   *  - status      → always IN_PROGRESS (the queue consumer drives final state)
   *  - action      → UPDATE_WORKFLOW_VARIABLES (closest semantic match)
   *  - output      → serialised Workflow snapshot (key fields only)
   *
   * @param event - The lifecycle event payload received from the publisher.
   */
  private async handleEvent(event: WorkflowLifecycleEvent): Promise<void> {
    const { workflow, eventName, firedAtMs } = event;

    try {
      // Build a stable, human-readable message ID that embeds the event type
      // so that idempotent consumers can skip duplicate deliveries.
      const messageId = `${workflow.workflowId}:${eventName}:${firedAtMs}`;

      // Construct the EventExecution payload.
      const execution: EventExecution = {
        id: messageId,
        messageId: workflow.workflowId,
        name: workflow.workflowDefinition?.name ?? workflow.workflowId,
        event: eventName,
        // Java stores 'created' as epoch-ms; keep ms precision for parity.
        created: firedAtMs,
        status: EventExecutionStatus.IN_PROGRESS,
        action: EventActionType.UPDATE_WORKFLOW_VARIABLES,
        output: this.buildOutputMap(event),
      };

      // Serialise the EventExecution as the queue message payload.
      const payload = JSON.stringify(execution);

      await this.queueDAO.pushMessages(this.queueName, [
        {
          id: messageId,
          payload,
          priority: this.priority,
          timeout: this.offsetTimeInSeconds,
        },
      ]);
    } catch (err: unknown) {
      // Swallow the error to avoid disrupting the workflow execution path.
      // Production deployments should surface this via structured logging or
      // a metrics counter on the QueueDAO implementation.
      console.error(
        `[WorkflowEventListener] Failed to push event "${eventName}" for workflow ` +
          `"${workflow.workflowId}" to queue "${this.queueName}":`,
        err,
      );
    }
  }

  /**
   * Builds the output map that is embedded in the EventExecution record.
   *
   * Only essential, non-circular fields from the Workflow snapshot are
   * included to keep the message size manageable and avoid serialisation
   * issues with deeply-nested or cyclic history arrays.
   */
  private buildOutputMap(event: WorkflowLifecycleEvent): Record<string, unknown> {
    const { workflow, eventName, firedAtMs } = event;
    return {
      workflowId: workflow.workflowId,
      workflowStatus: workflow.status,
      workflowDefinitionName: workflow.workflowDefinition?.name,
      workflowDefinitionVersion: workflow.workflowDefinition?.version,
      correlationId: workflow.correlationId,
      parentWorkflowId: workflow.parentWorkflowId,
      reasonForIncompletion: workflow.reasonForIncompletion,
      startTime: workflow.createTime,
      endTime: workflow.endTime,
      priority: workflow.priority,
      eventName,
      firedAtMs,
    };
  }
}
