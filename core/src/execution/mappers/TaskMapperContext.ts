import type { TaskDef, WorkflowTask } from '@conductor/common';
import type { WorkflowModel, TaskModel } from '../types.js';
import type { DeciderService } from '../DeciderService.js';

export class TaskMapperContext {
  readonly workflowModel: WorkflowModel;
  readonly taskDefinition: TaskDef | null;
  readonly workflowTask: WorkflowTask;
  readonly taskInput: Record<string, unknown>;
  readonly retryCount: number;
  readonly retryTaskId: string | null;
  readonly taskId: string;
  readonly parentTaskReferenceName: string | null;
  readonly deciderService: DeciderService;

  constructor(params: {
    workflowModel: WorkflowModel;
    taskDefinition: TaskDef | null;
    workflowTask: WorkflowTask;
    taskInput: Record<string, unknown>;
    retryCount: number;
    retryTaskId: string | null;
    taskId: string;
    parentTaskReferenceName?: string | null;
    deciderService: DeciderService;
  }) {
    this.workflowModel = params.workflowModel;
    this.taskDefinition = params.taskDefinition;
    this.workflowTask = params.workflowTask;
    this.taskInput = params.taskInput;
    this.retryCount = params.retryCount;
    this.retryTaskId = params.retryTaskId;
    this.taskId = params.taskId;
    this.parentTaskReferenceName = params.parentTaskReferenceName ?? null;
    this.deciderService = params.deciderService;
  }

  get workflowDefinition() {
    return this.workflowModel.workflowDefinition;
  }

  createTaskModel(): TaskModel {
    return {
      taskId: this.taskId,
      taskType: '',
      taskDefName: this.workflowTask.name ?? '',
      referenceTaskName: this.workflowTask.taskReferenceName,
      status: 'SCHEDULED',
      inputData: { ...this.taskInput },
      outputData: {},
      workflowInstanceId: this.workflowModel.workflowId,
      workflowType: this.workflowModel.workflowName,
      retryCount: this.retryCount,
      retriedTaskId: null,
      seq: 0,
      startTime: 0,
      endTime: 0,
      scheduledTime: Date.now(),
      updateTime: 0,
      firstScheduledTime: 0,
      callbackAfterSeconds: this.workflowTask.startDelay ?? 0,
      callbackAfterMs: (this.workflowTask.startDelay ?? 0) * 1000,
      pollCount: 0,
      workerId: null,
      reasonForIncompletion: null,
      subWorkflowId: null,
      externalOutputPayloadStoragePath: null,
      externalInputPayloadStoragePath: null,
      workflowTask: this.workflowTask,
      iteration: 0,
      executed: false,
      retried: false,
      domain: null,
      workflowPriority: this.workflowModel.priority,
      correlationId: this.workflowModel.correlationId,
      parentTaskReferenceName: this.parentTaskReferenceName,
      isolationGroupId: null,
      outputMessage: null,
      inputMessage: null,
      waitTimeout: 0,
      startDelayInSeconds: this.workflowTask.startDelay ?? 0,
      subworkflowChanged: false,
      loopOverTask: false,
      taskDefinition: this.taskDefinition,
    };
  }
}
