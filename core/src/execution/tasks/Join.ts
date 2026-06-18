import { WorkflowSystemTask } from '../WorkflowSystemTask.js';
import type { WorkflowModel, TaskModel } from '../types.js';
import type { WorkflowExecutor } from '../WorkflowExecutor.js';
import { TaskType, isTaskTerminal, isTaskSuccessful } from '@conductor/common';

const EVALUATION_OFFSET_BASE = 1.2;

export class Join extends WorkflowSystemTask {
  private systemTaskPostponeThreshold: number;

  constructor(systemTaskPostponeThreshold = 5) {
    super(TaskType.JOIN);
    this.systemTaskPostponeThreshold = systemTaskPostponeThreshold;
  }

  override execute(
    workflow: WorkflowModel,
    task: TaskModel,
    workflowExecutor: WorkflowExecutor,
  ): boolean {
    const failureReasons: string[] = [];
    const optionalTaskFailures: string[] = [];
    let joinOn = (task.inputData['joinOn'] ?? []) as string[];

    if (task.loopOverTask) {
      joinOn = joinOn.map((name) => appendIteration(name, task.iteration));
    }

    const allTasksTerminal = joinOn.every((refName) => {
      const t = workflow.tasks.find((x) => x.referenceTaskName === refName);
      return t != null && isTaskTerminal(t.status);
    });

    for (const joinOnRef of joinOn) {
      const forkedTask = workflow.tasks.find((x) => x.referenceTaskName === joinOnRef);
      if (!forkedTask) continue;

      const taskStatus = forkedTask.status;

      if (Object.keys(forkedTask.outputData).length > 0) {
        task.outputData[joinOnRef] = forkedTask.outputData;
      }

      const isJoinFailure =
        !isTaskSuccessful(taskStatus) &&
        !(forkedTask.workflowTask?.optional ?? false) &&
        (!(forkedTask.workflowTask?.permissive ?? false) || allTasksTerminal);

      if (isJoinFailure) {
        const reasons = joinOn
          .map((ref) => workflow.tasks.find((x) => x.referenceTaskName === ref))
          .filter(Boolean)
          .filter((t) => !isTaskSuccessful(t!.status))
          .map((t) => t!.reasonForIncompletion)
          .filter(Boolean)
          .join(' ');
        failureReasons.push(reasons);
        task.reasonForIncompletion = failureReasons.join(' ');
        task.status = 'FAILED';
        return true;
      }

      if (
        (forkedTask.workflowTask?.optional ?? false) &&
        taskStatus === 'COMPLETED_WITH_ERRORS'
      ) {
        optionalTaskFailures.push(`${forkedTask.taskDefName}/${forkedTask.taskId}`);
      }
    }

    if (allTasksTerminal) {
      if (optionalTaskFailures.length > 0) {
        task.status = 'COMPLETED_WITH_ERRORS';
        optionalTaskFailures.push('completed with errors');
        task.reasonForIncompletion = optionalTaskFailures.join(' ');
      } else {
        task.status = 'COMPLETED';
      }
      return true;
    }

    return false;
  }

  override getEvaluationOffset(taskModel: TaskModel, maxOffset: number): number | undefined {
    const workflowTask = taskModel.workflowTask;
    if (workflowTask?.joinMode === 'SYNC') {
      return 0;
    }

    const pollCount = taskModel.pollCount;
    if (pollCount <= this.systemTaskPostponeThreshold) {
      return 0;
    }

    const exp = pollCount - this.systemTaskPostponeThreshold;
    return Math.min(Math.pow(EVALUATION_OFFSET_BASE, exp), maxOffset);
  }

  override isAsync(): boolean {
    return true;
  }
}

function appendIteration(refName: string, iteration: number): string {
  return `${refName}_${iteration}`;
}
