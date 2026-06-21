import { createHmac, timingSafeEqual } from 'node:crypto';
import type { EventService } from './EventService.js';
import type { WorkflowService } from './WorkflowService.js';

/**
 * WebhookService verifies inbound provider webhooks (Slack, GitHub) using
 * HMAC signatures and dispatches matching event handlers to start workflows.
 *
 * Security: all verification is fail-closed. A missing secret, missing
 * signature/timestamp, stale timestamp, or any mismatch returns false so the
 * controller can reject the request. Signature comparison is constant-time.
 */
export class WebhookService {
  // Slack replay-protection window: reject requests older than 5 minutes.
  private static readonly SLACK_MAX_SKEW_SECONDS = 60 * 5;

  constructor(
    private readonly eventService: EventService,
    private readonly workflowService: WorkflowService,
  ) {}

  /**
   * Constant-time, length-safe comparison of two signature strings.
   * timingSafeEqual throws if buffers differ in length, so we guard with a
   * length check first. The length check is not itself secret-dependent
   * (signature formats are fixed length), so it does not leak useful timing.
   */
  private static safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }

  /**
   * Verify a Slack request signature.
   * Computes `v0=` + HMAC-SHA256(secret, `v0:${timestamp}:${body}`) and
   * compares it constant-time against the provided signature. Fail-closed.
   */
  verifySlack(rawBody: Buffer, signature?: string, timestamp?: string): boolean {
    const secret = process.env.SLACK_SIGNING_SECRET;
    // Fail closed when the signing secret is not configured.
    if (!secret) {
      return false;
    }
    if (!signature || !timestamp) {
      return false;
    }

    // Replay protection: reject timestamps outside the allowed skew window.
    const tsSeconds = Number.parseInt(timestamp, 10);
    if (!Number.isFinite(tsSeconds)) {
      return false;
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - tsSeconds) > WebhookService.SLACK_MAX_SKEW_SECONDS) {
      return false;
    }

    const base = `v0:${timestamp}:${rawBody.toString('utf8')}`;
    const expected = `v0=${createHmac('sha256', secret).update(base).digest('hex')}`;
    return WebhookService.safeEqual(expected, signature);
  }

  /**
   * Verify a GitHub webhook signature.
   * Computes `sha256=` + HMAC-SHA256(secret, rawBody) and compares it
   * constant-time against the X-Hub-Signature-256 header. Fail-closed.
   */
  verifyGitHub(rawBody: Buffer, signature?: string): boolean {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    // Fail closed when the webhook secret is not configured.
    if (!secret) {
      return false;
    }
    if (!signature) {
      return false;
    }

    const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    return WebhookService.safeEqual(expected, signature);
  }

  /**
   * Dispatch a verified webhook event to all active event handlers registered
   * for `eventName`. For each handler action that specifies a start_workflow
   * with a name, a workflow is started with the action input merged with the
   * webhook payload under the `event` key. Returns the number of workflows
   * started. One failing handler must not abort the rest.
   */
  async dispatch(eventName: string, payload: unknown): Promise<number> {
    let started = 0;
    let handlers;
    try {
      handlers = await this.eventService.getEventHandlersForEvent(eventName, true);
    } catch (err) {
      console.error(`[WebhookService] Failed to load handlers for event ${eventName}:`, err);
      return 0;
    }

    for (const handler of handlers) {
      for (const action of handler.actions ?? []) {
        const startWorkflow = action.start_workflow;
        if (!startWorkflow?.name) {
          continue;
        }
        try {
          await this.workflowService.startWorkflow({
            name: startWorkflow.name,
            version: startWorkflow.version,
            input: { ...(startWorkflow.input ?? {}), event: payload },
          });
          started += 1;
        } catch (err) {
          // One bad handler must not abort the rest.
          console.error(
            `[WebhookService] Failed to start workflow ${startWorkflow.name} for event ${eventName}:`,
            err,
          );
        }
      }
    }

    return started;
  }
}
