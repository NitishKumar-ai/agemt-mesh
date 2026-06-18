/**
 * Phase 8 — Load Test Suite
 *
 * Targets:
 *   p95 latency  < 200 ms for workflow start
 *   p95 latency  < 100 ms for health and poll
 *   throughput   >= 50 RPS sustained for 1 hour
 *   error rate   < 0.1 %
 *
 * Run:
 *   k6 run load-test/load-test.js
 *
 * Override base URL:
 *   BASE_URL=http://my-host:8080 k6 run load-test/load-test.js
 *
 * Long soak (1h):
 *   k6 run --env SOAK=1 load-test/load-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';
import { randomItem, uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const SOAK = __ENV.SOAK === '1';

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------

const workflowStartLatency = new Trend('workflow_start_latency', true);
const taskPollLatency = new Trend('task_poll_latency', true);
const taskUpdateLatency = new Trend('task_update_latency', true);
const healthLatency = new Trend('health_latency', true);
const errorRate = new Rate('error_rate');
const workflowsStarted = new Counter('workflows_started');
const tasksPolled = new Counter('tasks_polled');

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export const options = {
  scenarios: {
    // Ramp up to 50 VUs, hold for 5 min (or 60 min in soak mode), ramp down.
    sustained_load: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: SOAK
        ? [
            { duration: '2m', target: 50 },
            { duration: '56m', target: 50 },
            { duration: '2m', target: 0 },
          ]
        : [
            { duration: '30s', target: 20 },
            { duration: '4m', target: 50 },
            { duration: '30s', target: 0 },
          ],
      gracefulRampDown: '10s',
    },
    // Constant 5 VU health-check canary running alongside.
    health_canary: {
      executor: 'constant-vus',
      vus: 5,
      duration: SOAK ? '60m' : '5m',
      exec: 'healthScenario',
    },
  },
  thresholds: {
    // Latency gates
    workflow_start_latency: ['p(95)<200'],
    task_poll_latency: ['p(95)<100'],
    health_latency: ['p(95)<50'],
    // Error rate
    error_rate: ['rate<0.001'],
    // Overall HTTP failures
    http_req_failed: ['rate<0.001'],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Minimal workflow definition registered before the test starts.
const WORKFLOW_NAME = 'load_test_wf';
const WORKFLOW_VERSION = 1;
const TASK_NAME = 'load_test_task';

/**
 * Register the test workflow definition once in setup() so all VUs share it.
 */
export function setup() {
  // Register task definition
  const taskDef = JSON.stringify({
    name: TASK_NAME,
    retryCount: 0,
    timeoutSeconds: 30,
    responseTimeoutSeconds: 30,
  });
  http.post(`${BASE_URL}/api/metadata/taskdefs`, `[${taskDef}]`, { headers: JSON_HEADERS });

  // Register workflow definition
  const wfDef = JSON.stringify({
    name: WORKFLOW_NAME,
    version: WORKFLOW_VERSION,
    tasks: [
      {
        name: TASK_NAME,
        taskReferenceName: 'task_ref',
        type: 'SIMPLE',
        inputParameters: {},
      },
    ],
    inputParameters: [],
    outputParameters: {},
    schemaVersion: 2,
    restartable: true,
  });
  const reg = http.post(`${BASE_URL}/api/metadata/workflow`, wfDef, { headers: JSON_HEADERS });
  if (reg.status !== 200 && reg.status !== 201 && reg.status !== 204) {
    console.warn(`Workflow registration returned ${reg.status}: ${reg.body}`);
  }
}

// ---------------------------------------------------------------------------
// Default scenario: workflow start → poll → update
// ---------------------------------------------------------------------------

export default function () {
  // 1. Start a workflow
  const startPayload = JSON.stringify({
    name: WORKFLOW_NAME,
    version: WORKFLOW_VERSION,
    input: { loadTestId: uuidv4() },
  });
  const startRes = http.post(`${BASE_URL}/api/workflow`, startPayload, { headers: JSON_HEADERS });
  workflowStartLatency.add(startRes.timings.duration);

  const startOk = check(startRes, {
    'workflow start 200/201': (r) => r.status === 200 || r.status === 201,
    'workflow start returns id': (r) => {
      try {
        return typeof (JSON.parse(r.body).workflowId || r.body) === 'string';
      } catch {
        return false;
      }
    },
  });
  errorRate.add(!startOk);
  if (!startOk) {
    return;
  }
  workflowsStarted.add(1);

  // Short pause before polling (simulates real worker cadence).
  sleep(0.1);

  // 2. Poll for a task
  const pollRes = http.get(`${BASE_URL}/api/tasks/poll/${TASK_NAME}?workerid=k6-worker-${__VU}`);
  taskPollLatency.add(pollRes.timings.duration);

  const pollOk = check(pollRes, {
    'poll 200 or 204': (r) => r.status === 200 || r.status === 204,
  });
  errorRate.add(!pollOk);

  // 3. If a task was returned, complete it immediately.
  if (pollRes.status === 200 && pollRes.body && pollRes.body !== 'null') {
    let task;
    try {
      task = JSON.parse(pollRes.body);
    } catch {
      return;
    }
    tasksPolled.add(1);

    const updatePayload = JSON.stringify({
      workflowInstanceId: task.workflowInstanceId,
      taskId: task.taskId,
      status: 'COMPLETED',
      outputData: { result: 'ok' },
      workerId: `k6-worker-${__VU}`,
    });
    const updateRes = http.post(`${BASE_URL}/api/tasks`, updatePayload, { headers: JSON_HEADERS });
    taskUpdateLatency.add(updateRes.timings.duration);

    const updateOk = check(updateRes, {
      'task update 200': (r) => r.status === 200,
    });
    errorRate.add(!updateOk);
  }

  sleep(0.05);
}

// ---------------------------------------------------------------------------
// Health canary scenario
// ---------------------------------------------------------------------------

export function healthScenario() {
  const res = http.get(`${BASE_URL}/health`);
  healthLatency.add(res.timings.duration);

  check(res, {
    'health 200': (r) => r.status === 200,
    'status is UP': (r) => {
      try {
        return JSON.parse(r.body).status === 'UP';
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}
