import { WorkflowSystemTask } from '../WorkflowSystemTask.js';
import { TaskType } from '@conductor/common';

export class Fork extends WorkflowSystemTask {
  constructor() {
    super(TaskType.FORK_JOIN);
  }
}
