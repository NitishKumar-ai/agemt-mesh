import type { TaskModel } from '@conductor/common';
import type { ExecutionDAO } from '@conductor/common-persistence';
import type { WorkflowService } from './WorkflowService.js';

export class AdminService {
  constructor(
    private readonly workflowService: WorkflowService,
    private readonly executionDAO: ExecutionDAO,
    private readonly config: Record<string, object> = {},
  ) {}

  getAllConfig(): Record<string, object> {
    return { ...this.config };
  }

  async getListOfPendingTask(taskType: string, start = 0, count = 100): Promise<TaskModel[]> {
    const tasks = await this.workflowService.getPendingTasksForTaskType(taskType);
    const end = Math.min(tasks.length, start + count);
    return tasks.slice(Math.min(start, tasks.length), end);
  }

  async requeueSweep(workflowId: string): Promise<string> {
    return this.workflowService.requeueSweep(workflowId);
  }

  async verifyAndRepairWorkflowConsistency(_workflowId: string): Promise<boolean> {
    throw new Error('WorkflowRepairService is not implemented in TypeScript');
  }

  async getEventQueues(_verbose: boolean): Promise<Record<string, unknown>> {
    throw new Error('Event processing is DISABLED in TypeScript');
  }
}
