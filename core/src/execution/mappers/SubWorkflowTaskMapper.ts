import type { TaskMapper } from './TaskMapper.js';
import type { TaskMapperContext } from './TaskMapperContext.js';
import type { TaskModel } from '../types.js';
import { TaskType } from '@agentmesh/common';

export class SubWorkflowTaskMapper implements TaskMapper {
  getTaskType(): string {
    return TaskType.SUB_WORKFLOW;
  }

  getMappedTasks(taskMapperContext: TaskMapperContext): TaskModel[] {
    const taskInput = taskMapperContext.taskInput;
    const workflowTask = taskMapperContext.workflowTask;

    const subWorkflowTask = taskMapperContext.createTaskModel();
    subWorkflowTask.taskType = TaskType.SUB_WORKFLOW;
    subWorkflowTask.taskDefName = TaskType.SUB_WORKFLOW;
    subWorkflowTask.startTime = Date.now();
    subWorkflowTask.inputData = { ...taskInput };
    subWorkflowTask.status = 'SCHEDULED';

    if (workflowTask.subWorkflowParam) {
      const subworkflowParam = workflowTask.subWorkflowParam;
      if (subworkflowParam.name) {
        subWorkflowTask.inputData['subWorkflowName'] = subworkflowParam.name;
      }
      if (subworkflowParam.version != null) {
        subWorkflowTask.inputData['subWorkflowVersion'] = subworkflowParam.version;
      }
      if (subworkflowParam.taskToDomain) {
        subWorkflowTask.inputData['subWorkflowTaskToDomain'] = subworkflowParam.taskToDomain;
      }
      subWorkflowTask.inputData['workflowInput'] = (subworkflowParam as Record<string, unknown>)['workflowInput'] ?? taskInput;
    }

    return [subWorkflowTask];
  }
}
