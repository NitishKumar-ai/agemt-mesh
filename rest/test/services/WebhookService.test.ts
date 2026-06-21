import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { WebhookService } from '../../src/services/WebhookService.js';
import type { EventService } from '../../src/services/EventService.js';
import type { WorkflowService } from '../../src/services/WorkflowService.js';

const SLACK_SECRET = 'slack_test_secret';
const GITHUB_SECRET = 'github_test_secret';

function slackSignature(secret: string, timestamp: string, body: Buffer): string {
  const base = `v0:${timestamp}:${body.toString('utf8')}`;
  return `v0=${createHmac('sha256', secret).update(base).digest('hex')}`;
}

function githubSignature(secret: string, body: Buffer): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

// Minimal fakes so we exercise WebhookService without a database.
function makeService(opts?: {
  handlers?: unknown[];
  startWorkflow?: (req: unknown) => Promise<string>;
}): {
  service: WebhookService;
  startCalls: unknown[];
} {
  const startCalls: unknown[] = [];
  const eventService = {
    getEventHandlersForEvent: async () => opts?.handlers ?? [],
  } as unknown as EventService;
  const workflowService = {
    startWorkflow: async (req: unknown) => {
      startCalls.push(req);
      if (opts?.startWorkflow) {
        return opts.startWorkflow(req);
      }
      return 'wf-id';
    },
  } as unknown as WorkflowService;
  return { service: new WebhookService(eventService, workflowService), startCalls };
}

describe('WebhookService.verifySlack', () => {
  const { service } = makeService();
  const body = Buffer.from(JSON.stringify({ type: 'event_callback' }));

  beforeEach(() => {
    process.env.SLACK_SIGNING_SECRET = SLACK_SECRET;
  });
  afterEach(() => {
    delete process.env.SLACK_SIGNING_SECRET;
  });

  it('accepts a valid signature', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = slackSignature(SLACK_SECRET, ts, body);
    expect(service.verifySlack(body, sig, ts)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = slackSignature(SLACK_SECRET, ts, body);
    const tampered = Buffer.from(JSON.stringify({ type: 'evil' }));
    expect(service.verifySlack(tampered, sig, ts)).toBe(false);
  });

  it('rejects a stale timestamp (replay protection)', () => {
    const staleTs = String(Math.floor(Date.now() / 1000) - 60 * 10);
    const sig = slackSignature(SLACK_SECRET, staleTs, body);
    expect(service.verifySlack(body, sig, staleTs)).toBe(false);
  });

  it('rejects when the secret is unset', () => {
    delete process.env.SLACK_SIGNING_SECRET;
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = slackSignature(SLACK_SECRET, ts, body);
    expect(service.verifySlack(body, sig, ts)).toBe(false);
  });

  it('rejects when signature or timestamp is missing', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    expect(service.verifySlack(body, undefined, ts)).toBe(false);
    expect(service.verifySlack(body, 'v0=abc', undefined)).toBe(false);
  });
});

describe('WebhookService.verifyGitHub', () => {
  const { service } = makeService();
  const body = Buffer.from(JSON.stringify({ action: 'opened' }));

  beforeEach(() => {
    process.env.GITHUB_WEBHOOK_SECRET = GITHUB_SECRET;
  });
  afterEach(() => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
  });

  it('accepts a valid signature', () => {
    const sig = githubSignature(GITHUB_SECRET, body);
    expect(service.verifyGitHub(body, sig)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const sig = githubSignature(GITHUB_SECRET, body);
    const tampered = Buffer.from(JSON.stringify({ action: 'evil' }));
    expect(service.verifyGitHub(tampered, sig)).toBe(false);
  });

  it('rejects when the secret is unset', () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    const sig = githubSignature(GITHUB_SECRET, body);
    expect(service.verifyGitHub(body, sig)).toBe(false);
  });

  it('rejects when the signature is missing', () => {
    expect(service.verifyGitHub(body, undefined)).toBe(false);
  });
});

describe('WebhookService.dispatch', () => {
  it('starts a workflow for each matching handler action', async () => {
    const handlers = [
      {
        name: 'h1',
        event: 'webhook/slack',
        active: true,
        actions: [{ start_workflow: { name: 'wf_a', version: 2, input: { foo: 'bar' } } }],
      },
      {
        name: 'h2',
        event: 'webhook/slack',
        active: true,
        actions: [
          { start_workflow: { name: 'wf_b', input: {} } },
          { complete_task: {} }, // no start_workflow -> skipped
        ],
      },
    ];
    const { service, startCalls } = makeService({ handlers });
    const payload = { hello: 'world' };

    const started = await service.dispatch('webhook/slack', payload);

    expect(started).toBe(2);
    expect(startCalls).toEqual([
      { name: 'wf_a', version: 2, input: { foo: 'bar', event: payload } },
      { name: 'wf_b', version: undefined, input: { event: payload } },
    ]);
  });

  it('continues after a failing handler', async () => {
    const handlers = [
      {
        name: 'bad',
        event: 'webhook/github',
        active: true,
        actions: [{ start_workflow: { name: 'wf_bad', input: {} } }],
      },
      {
        name: 'good',
        event: 'webhook/github',
        active: true,
        actions: [{ start_workflow: { name: 'wf_good', input: {} } }],
      },
    ];
    let call = 0;
    const { service } = makeService({
      handlers,
      startWorkflow: async () => {
        call += 1;
        if (call === 1) {
          throw new Error('boom');
        }
        return 'wf-id';
      },
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const started = await service.dispatch('webhook/github', { x: 1 });

    expect(started).toBe(1);
    vi.restoreAllMocks();
  });

  it('returns 0 when no handlers match', async () => {
    const { service } = makeService({ handlers: [] });
    const started = await service.dispatch('webhook/unknown', {});
    expect(started).toBe(0);
  });
});
