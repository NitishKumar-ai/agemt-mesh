import { test, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import axios from 'axios';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_LITE_DIR = path.resolve(__dirname, '../server-lite');
const DB_PATH = path.resolve(__dirname, 'chaos-test.db');
const PORT = 8089;
const BASE_URL = `http://localhost:${PORT}`;

let serverProcess: ChildProcess | null = null;

async function startServer() {
  return new Promise<void>((resolve, reject) => {
    console.log('Starting server-lite for chaos test...');
    serverProcess = spawn('node', ['dist/index.js'], {
      cwd: SERVER_LITE_DIR,
      env: {
        ...process.env,
        PORT: PORT.toString(),
        DB_PATH: DB_PATH,
        NODE_ENV: 'test',
        LOG_FORMAT: 'tiny',
      },
      stdio: 'inherit',
    });

    const timeout = setTimeout(() => {
      reject(new Error('Server start timeout'));
    }, 30000);

    const checkHealth = async () => {
      try {
        const res = await axios.get(`${BASE_URL}/health`);
        console.log(`Health check: ${res.status}`);
        if (res.status === 200) {
          clearTimeout(timeout);
          resolve();
          return;
        }
      } catch (e: any) {
        console.log(`Health check failed: ${e.message}`);
      }
      setTimeout(checkHealth, 1000);
    };

    checkHealth();
  });
}

async function stopServer(force = false) {
  if (serverProcess) {
    console.log(`Stopping server-lite (pid=${serverProcess.pid}, force=${force})...`);
    if (force) {
      serverProcess.kill('SIGKILL');
    } else {
      serverProcess.kill('SIGTERM');
    }
    await new Promise((resolve) => serverProcess?.on('exit', resolve));
    serverProcess = null;
  }
}

beforeAll(async () => {
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }
}, 30000);

afterAll(async () => {
  await stopServer();
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }
}, 30000);

test('Chaos Test: System recovers from abrupt crash', async () => {
  await startServer();

  // 1. Register a simple workflow
  const wfName = 'chaos_test_wf';
  await axios.post(`${BASE_URL}/api/metadata/workflow`, {
    name: wfName,
    version: 1,
    tasks: [
      {
        name: 'chaos_task',
        taskReferenceName: 't1',
        type: 'SIMPLE',
        inputParameters: {},
      },
    ],
  });

  // 2. Start workflow
  const startRes = await axios.post(`${BASE_URL}/api/workflow`, {
    name: wfName,
    version: 1,
    input: {},
  });
  const workflowId = startRes.data;
  console.log(`Started workflow: ${workflowId}`);

  // 3. Verify workflow is running
  let wfStatus = await axios.get(`${BASE_URL}/api/workflow/${workflowId}`);
  expect(wfStatus.data.status).toBe('RUNNING');

  // 4. ABRUPT CRASH (kill -9)
  console.log('SIMULATING CRASH...');
  await stopServer(true);

  // 5. RESTART
  console.log('RESTARTING...');
  await startServer();

  // 6. Verify workflow still exists and is in RUNNING or COMPLETED state
  wfStatus = await axios.get(`${BASE_URL}/api/workflow/${workflowId}`);
  expect(wfStatus.data.status).toBe('RUNNING');

  // 7. Poll and complete task to ensure progress
  const pollRes = await axios.get(`${BASE_URL}/api/tasks/poll/chaos_task?workerid=chaos-worker`);
  expect(pollRes.status).toBe(200);
  const task = pollRes.data;
  expect(task.workflowInstanceId).toBe(workflowId);

  await axios.post(`${BASE_URL}/api/tasks`, {
    workflowInstanceId: workflowId,
    taskId: task.taskId,
    status: 'COMPLETED',
    outputData: { result: 'recovered' },
  });

  // 8. Wait for completion
  let completed = false;
  for (let i = 0; i < 30; i++) {
    wfStatus = await axios.get(`${BASE_URL}/api/workflow/${workflowId}`);
    if (wfStatus.data.status === 'COMPLETED') {
      completed = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  expect(completed).toBe(true);
  console.log('Chaos test passed: workflow recovered and completed.');
}, 180000);
