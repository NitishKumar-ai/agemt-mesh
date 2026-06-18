import { WorkflowSystemTask } from '../WorkflowSystemTask.js';
import type { WorkflowModel, TaskModel } from '../types.js';
import type { WorkflowExecutor } from '../WorkflowExecutor.js';
import { TaskType, isTaskTerminal } from '@conductor/common';

export class ExclusiveJoin extends WorkflowSystemTask {
  constructor() {
    super(TaskType.EXCLUSIVE_JOIN);
  }

  override execute(
    workflow: WorkflowModel,
    task: TaskModel,
    workflowExecutor: WorkflowExecutor,
  ): boolean {
    const joinOn = (task.inputData['joinOn'] ?? []) as string[];

    for (const joinOnRef of joinOn) {
      const forkedTask = workflow.tasks.find((x) => x.referenceTaskName === joinOnRef);
      if (forkedTask && isTaskTerminal(forkedTask.status)) {
        task.status = 'COMPLETED';
        task.outputData[joinOnRef] = forkedTask.outputData;
        return true;
      }
    }

    return false;
  }
}
