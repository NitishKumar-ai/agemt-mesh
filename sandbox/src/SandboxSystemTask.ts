import { WorkflowSystemTask } from '@agentmesh/core';
import type { WorkflowModel, TaskModel, WorkflowExecutor } from '@agentmesh/core';
import { TaskStatus } from '@agentmesh/common';
import { Sandbox } from '@e2b/code-interpreter';

export interface SandboxExecutionRequest {
  code: string;
  language?: string;
  timeoutMs?: number;
}

export class SandboxSystemTask extends WorkflowSystemTask {
  public static readonly NAME = 'SANDBOX_EXECUTE';

  constructor(
    private readonly e2bApiKey: string,
    private readonly allowListDomains: string[] = [],
  ) {
    super(SandboxSystemTask.NAME);
  }

  override start(
    _workflow: WorkflowModel,
    task: TaskModel,
    _workflowExecutor: WorkflowExecutor,
  ): void {
    task.status = TaskStatus.IN_PROGRESS;
  }

  async executeAsync(
    workflow: WorkflowModel,
    task: TaskModel,
    workflowExecutor: WorkflowExecutor,
  ): Promise<void> {
    try {
      const input = task.inputData as unknown as SandboxExecutionRequest;
      const code = input.code;
      const language = input.language || 'python';
      const timeoutMs = input.timeoutMs || 30000;

      // Note: currently E2B doesn't expose a fine-grained 'allowListDomains' in its default Sandbox init directly,
      // but in production we can configure a custom Sandbox template or use proxy to enforce egress rules.
      // For demonstration in Phase 7, we simulate this or pass it if E2B supports it via custom env/proxy.

      const sandbox = await Sandbox.create({
        apiKey: this.e2bApiKey,
        timeoutMs: timeoutMs,
      });

      try {
        let stdout: string[] | unknown[];
        let stderr: string[] | unknown[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let error: any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let results: any = [];

        if (language === 'python') {
          const execResult = await sandbox.runCode(code);
          stdout = execResult.logs?.stdout || [];
          stderr = execResult.logs?.stderr || [];
          error = execResult.error;
          results = execResult.results;
        } else {
          // Provide basic support for other shell commands
          const cmdResult = await sandbox.commands.run(code);
          stdout = [cmdResult.stdout];
          stderr = [cmdResult.stderr];
          error = cmdResult.error;
        }

        task.outputData = {
          stdout,
          stderr,
          error,
          results,
        };

        if (error || (stderr && stderr.length > 0 && stderr[0] !== '')) {
          // For simple cases, we can mark failed or let the caller inspect outputData
          // Assuming stderr means error for now unless configured otherwise
          task.status = TaskStatus.FAILED;
          task.reasonForIncompletion = 'Sandbox execution returned error or stderr';
        } else {
          task.status = TaskStatus.COMPLETED;
        }
      } finally {
        await sandbox.kill();
      }
    } catch (e: unknown) {
      task.status = TaskStatus.FAILED;
      task.reasonForIncompletion = (e as Error).message;
    }
  }

  override execute(
    _workflow: WorkflowModel,
    _task: TaskModel,
    _workflowExecutor: WorkflowExecutor,
  ): boolean {
    return false;
  }

  override isAsync(): boolean {
    return true;
  }
}
