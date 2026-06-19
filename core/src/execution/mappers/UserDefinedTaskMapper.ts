import type { TaskMapper } from './TaskMapper.js';
import type { TaskMapperContext } from './TaskMapperContext.js';
import type { TaskModel } from '../types.js';
import { TaskType } from '@agentmesh/common';

/**
 * Fallback mapper for any workflow task whose `type` doesn't match one of the
 * built-in control-flow types (DO_WHILE, FORK_JOIN, SWITCH, ...). This is how
 * registered WorkflowSystemTask types (HTTP, JSON_JQ_TRANSFORM, LLM_*, custom
 * sandboxed tasks, etc.) get scheduled — DeciderService falls back to the
 * `USER_DEFINED` mapper when `taskMappers.get(type)` finds nothing.
 */
export class UserDefinedTaskMapper implements TaskMapper {
  getTaskType(): string {
    return TaskType.USER_DEFINED;
  }

  getMappedTasks(taskMapperContext: TaskMapperContext): TaskModel[] {
    const taskInput = taskMapperContext.taskInput;

    const task = taskMapperContext.createTaskModel();
    task.taskType = taskMapperContext.workflowTask.type;
    task.taskDefName = taskMapperContext.workflowTask.name ?? '';
    task.startTime = Date.now();
    task.inputData = { ...taskInput };
    task.status = 'SCHEDULED';

    return [task];
  }
}
