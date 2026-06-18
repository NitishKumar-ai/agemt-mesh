import { describe, it, expect } from 'vitest';
import { JsonJqTransform } from '../../main/typescript/JsonJqTransform';
import { TaskModel, WorkflowModel } from '@conductor/core';

describe('JsonJqTransform', () => {
  it('dataShouldBeCorrectlySelected', async () => {
    const jsonJqTransform = new JsonJqTransform();
    const workflow = {} as WorkflowModel;
    const task: TaskModel = {
      taskType: 'JSON_JQ_TRANSFORM',
      status: 'IN_PROGRESS',
      referenceTaskName: 'task',
      retryCount: 0,
      seq: 1,
      pollCount: 1,
      taskDefName: 'JSON_JQ_TRANSFORM',
      scheduledTime: 0,
      startTime: 0,
      endTime: 0,
      updateTime: 0,
      startDelayInSeconds: 0,
      retried: false,
      executed: false,
      callbackFromWorker: true,
      responseTimeoutSeconds: 0,
      workflowInstanceId: 'wf-id',
      workflowType: 'wf',
      taskId: 'task-id',
      reasonForIncompletion: '',
      executionNameSpace: '',
      workerId: '',
      isolationGroupId: '',
      inputData: {
        queryExpression: '.inputJson.key[0]',
        inputJson: {
          key: ['VALUE']
        }
      },
      outputData: {}
    };

    await jsonJqTransform.start(workflow, task, {} as any);

    expect(task.outputData?.error).toBeUndefined();
    expect(task.outputData?.result).toBe('VALUE');
    expect(task.outputData?.resultList?.length).toBe(1);
    expect(task.outputData?.resultList?.[0]).toBe('VALUE');
  });

  it('simpleErrorShouldBeDisplayed', async () => {
    const jsonJqTransform = new JsonJqTransform();
    const workflow = {} as WorkflowModel;
    const task: TaskModel = {
      taskType: 'JSON_JQ_TRANSFORM',
      status: 'IN_PROGRESS',
      referenceTaskName: 'task',
      retryCount: 0,
      seq: 1,
      pollCount: 1,
      taskDefName: 'JSON_JQ_TRANSFORM',
      scheduledTime: 0,
      startTime: 0,
      endTime: 0,
      updateTime: 0,
      startDelayInSeconds: 0,
      retried: false,
      executed: false,
      callbackFromWorker: true,
      responseTimeoutSeconds: 0,
      workflowInstanceId: 'wf-id',
      workflowType: 'wf',
      taskId: 'task-id',
      reasonForIncompletion: '',
      executionNameSpace: '',
      workerId: '',
      isolationGroupId: '',
      inputData: {
        queryExpression: '{'
      },
      outputData: {}
    };

    await jsonJqTransform.start(workflow, task, {} as any);

    expect((task.outputData?.error as string)).toBeDefined();
    expect(task.status).toBe('FAILED');
  });

  

  it('mapResultShouldBeCorrectlyExtracted', async () => {
    const jsonJqTransform = new JsonJqTransform();
    const workflow = {} as WorkflowModel;
    const task: TaskModel = {
      taskType: 'JSON_JQ_TRANSFORM',
      status: 'IN_PROGRESS',
      referenceTaskName: 'task',
      retryCount: 0,
      seq: 1,
      pollCount: 1,
      taskDefName: 'JSON_JQ_TRANSFORM',
      scheduledTime: 0,
      startTime: 0,
      endTime: 0,
      updateTime: 0,
      startDelayInSeconds: 0,
      retried: false,
      executed: false,
      callbackFromWorker: true,
      responseTimeoutSeconds: 0,
      workflowInstanceId: 'wf-id',
      workflowType: 'wf',
      taskId: 'task-id',
      reasonForIncompletion: '',
      executionNameSpace: '',
      workerId: '',
      isolationGroupId: '',
      inputData: {
        input: {
          method: 'POST',
          successExpression: null,
          requestTransform: '{name: (.body.name + " you are a " + .body.title) }',
          responseTransform: '{result: "reply: " + .response.body.message}'
        },
        queryExpression: '{ requestTransform: (.input.requestTransform // ".body")  , responseTransform: (.input.responseTransform // ".response.body"), method: (.input.method // "GET"), document: (.input.document // "rgt_results"), successExpression: (.input.successExpression // "true")   }'
      },
      outputData: {}
    };

    await jsonJqTransform.start(workflow, task, {} as any);

    expect(task.outputData?.error).toBeUndefined();
    expect(typeof task.outputData?.result).toBe('object');
    const result: any = task.outputData?.result;
    expect(result.method).toBe('POST');
    expect(result.requestTransform).toBe('{name: (.body.name + " you are a " + .body.title) }');
    expect(result.responseTransform).toBe('{result: "reply: " + .response.body.message}');
    const resultList: any[] = task.outputData?.resultList as any[];
    expect(typeof resultList[0]).toBe('object');
  });

  it('stringResultShouldBeCorrectlyExtracted', async () => {
    const jsonJqTransform = new JsonJqTransform();
    const workflow = {} as WorkflowModel;
    const task: TaskModel = {
      taskType: 'JSON_JQ_TRANSFORM',
      status: 'IN_PROGRESS',
      referenceTaskName: 'task',
      retryCount: 0,
      seq: 1,
      pollCount: 1,
      taskDefName: 'JSON_JQ_TRANSFORM',
      scheduledTime: 0,
      startTime: 0,
      endTime: 0,
      updateTime: 0,
      startDelayInSeconds: 0,
      retried: false,
      executed: false,
      callbackFromWorker: true,
      responseTimeoutSeconds: 0,
      workflowInstanceId: 'wf-id',
      workflowType: 'wf',
      taskId: 'task-id',
      reasonForIncompletion: '',
      executionNameSpace: '',
      workerId: '',
      isolationGroupId: '',
      inputData: {
        data: [],
        queryExpression: 'if(.data | length >0) then "EXISTS" else "CREATE" end'
      },
      outputData: {}
    };

    await jsonJqTransform.start(workflow, task, {} as any);

    expect(task.outputData?.error).toBeUndefined();
    expect(typeof task.outputData?.result).toBe('string');
    expect(task.outputData?.result).toBe('CREATE');
  });

  it('listResultShouldBeCorrectlyExtracted', async () => {
    const jsonJqTransform = new JsonJqTransform();
    const workflow = {} as WorkflowModel;
    const inputData = { request: { transitions: [ { name: 'redeliver' }, { name: 'redeliver_from_validation_error' }, { name: 'redelivery' } ] } };
    const task: TaskModel = {
      taskType: 'JSON_JQ_TRANSFORM',
      status: 'IN_PROGRESS',
      referenceTaskName: 'task',
      retryCount: 0,
      seq: 1,
      pollCount: 1,
      taskDefName: 'JSON_JQ_TRANSFORM',
      scheduledTime: 0,
      startTime: 0,
      endTime: 0,
      updateTime: 0,
      startDelayInSeconds: 0,
      retried: false,
      executed: false,
      callbackFromWorker: true,
      responseTimeoutSeconds: 0,
      workflowInstanceId: 'wf-id',
      workflowType: 'wf',
      taskId: 'task-id',
      reasonForIncompletion: '',
      executionNameSpace: '',
      workerId: '',
      isolationGroupId: '',
      inputData: {
        inputData,
        queryExpression: '.inputData.request.transitions | map(.name)'
      },
      outputData: {}
    };

    await jsonJqTransform.start(workflow, task, {} as any);

    expect(task.outputData?.error).toBeUndefined();
    expect(Array.isArray(task.outputData?.result)).toBe(true);
    expect((task.outputData?.result as any[]).length).toBe(3);
  });

  it('nullResultShouldBeCorrectlyExtracted', async () => {
    const jsonJqTransform = new JsonJqTransform();
    const workflow = {} as WorkflowModel;
    const task: TaskModel = {
      taskType: 'JSON_JQ_TRANSFORM',
      status: 'IN_PROGRESS',
      referenceTaskName: 'task',
      retryCount: 0,
      seq: 1,
      pollCount: 1,
      taskDefName: 'JSON_JQ_TRANSFORM',
      scheduledTime: 0,
      startTime: 0,
      endTime: 0,
      updateTime: 0,
      startDelayInSeconds: 0,
      retried: false,
      executed: false,
      callbackFromWorker: true,
      responseTimeoutSeconds: 0,
      workflowInstanceId: 'wf-id',
      workflowType: 'wf',
      taskId: 'task-id',
      reasonForIncompletion: '',
      executionNameSpace: '',
      workerId: '',
      isolationGroupId: '',
      inputData: {
        queryExpression: 'null'
      },
      outputData: {}
    };

    await jsonJqTransform.start(workflow, task, {} as any);

    expect(task.outputData?.error).toBeUndefined();
    expect(task.outputData?.result).toBeNull();
  });
});
