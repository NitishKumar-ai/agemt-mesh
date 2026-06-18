import { describe, it, expect, vi } from 'vitest';
import { SandboxSystemTask } from '../src/SandboxSystemTask.js';
import { TaskStatus } from '@conductor/common';

describe('SandboxSystemTask', () => {
  it('blocks exfiltration attempt', async () => {
    // In a real environment, we'd either need a mock or a real E2B API key to run this test.
    // Assuming E2B token is in env, otherwise we skip or mock.
    const apiKey = process.env.E2B_API_KEY;
    if (!apiKey) {
      console.warn('Skipping E2B Sandbox exfiltration test because E2B_API_KEY is not set');
      return;
    }

    const taskHandler = new SandboxSystemTask(apiKey, ['api.github.com']); // allowed domains
    
    // Simulate an exfiltration attempt via curl
    const task: any = {
      taskId: 'test-task-123',
      inputData: {
        code: 'import urllib.request\ntry:\n  urllib.request.urlopen("https://example.com")\n  print("SUCCESS")\nexcept Exception as e:\n  print("FAILED", e)',
        language: 'python'
      }
    };
    
    const workflow: any = { workflowId: 'test-wf-123' };
    const workflowExecutor: any = {};
    
    await taskHandler.executeAsync(workflow, task, workflowExecutor);
    
    // If the egress filter is working, the URL access should fail or timeout
    // In our task output, if there's an error, task status should be FAILED or the output should contain FAILED.
    // For this simulation, we'll assert that the stdout contains FAILED or an error was caught.
    const output = task.outputData.stdout;
    expect(output.some((line: string) => line.includes('FAILED'))).toBe(true);
  }, 60000); // Wait up to 60s for sandbox
});
