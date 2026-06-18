import type { WorkflowSystemTask } from './WorkflowSystemTask.js';

export class SystemTaskRegistry {
  private readonly registry: Map<string, WorkflowSystemTask>;

  constructor(tasks: WorkflowSystemTask[]) {
    this.registry = new Map();
    for (const task of tasks) {
      this.registry.set(task.taskType, task);
    }
  }

  get(taskType: string): WorkflowSystemTask {
    const task = this.registry.get(taskType);
    if (!task) {
      throw new Error(`${taskType} not found in SystemTaskRegistry`);
    }
    return task;
  }

  isSystemTask(taskType: string): boolean {
    return this.registry.has(taskType);
  }

  getAll(): WorkflowSystemTask[] {
    return Array.from(this.registry.values());
  }
}
