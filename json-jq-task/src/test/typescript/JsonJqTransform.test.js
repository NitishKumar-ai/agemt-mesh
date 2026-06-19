"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const JsonJqTransform_1 = require("../../main/typescript/JsonJqTransform");
(0, vitest_1.describe)('JsonJqTransform', () => {
    (0, vitest_1.it)('dataShouldBeCorrectlySelected', async () => {
        const jsonJqTransform = new JsonJqTransform_1.JsonJqTransform();
        const workflow = {};
        const task = {
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
        await jsonJqTransform.start(workflow, task, {});
        (0, vitest_1.expect)(task.outputData?.error).toBeUndefined();
        (0, vitest_1.expect)(task.outputData?.result).toBe('VALUE');
        (0, vitest_1.expect)(task.outputData?.resultList?.length).toBe(1);
        (0, vitest_1.expect)(task.outputData?.resultList?.[0]).toBe('VALUE');
    });
    (0, vitest_1.it)('simpleErrorShouldBeDisplayed', async () => {
        const jsonJqTransform = new JsonJqTransform_1.JsonJqTransform();
        const workflow = {};
        const task = {
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
        await jsonJqTransform.start(workflow, task, {});
        (0, vitest_1.expect)(task.outputData?.error).toBeDefined();
        (0, vitest_1.expect)(task.status).toBe('FAILED');
    });
    (0, vitest_1.it)('mapResultShouldBeCorrectlyExtracted', async () => {
        const jsonJqTransform = new JsonJqTransform_1.JsonJqTransform();
        const workflow = {};
        const task = {
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
        await jsonJqTransform.start(workflow, task, {});
        (0, vitest_1.expect)(task.outputData?.error).toBeUndefined();
        (0, vitest_1.expect)(typeof task.outputData?.result).toBe('object');
        const result = task.outputData?.result;
        (0, vitest_1.expect)(result.method).toBe('POST');
        (0, vitest_1.expect)(result.requestTransform).toBe('{name: (.body.name + " you are a " + .body.title) }');
        (0, vitest_1.expect)(result.responseTransform).toBe('{result: "reply: " + .response.body.message}');
        const resultList = task.outputData?.resultList;
        (0, vitest_1.expect)(typeof resultList[0]).toBe('object');
    });
    (0, vitest_1.it)('stringResultShouldBeCorrectlyExtracted', async () => {
        const jsonJqTransform = new JsonJqTransform_1.JsonJqTransform();
        const workflow = {};
        const task = {
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
        await jsonJqTransform.start(workflow, task, {});
        (0, vitest_1.expect)(task.outputData?.error).toBeUndefined();
        (0, vitest_1.expect)(typeof task.outputData?.result).toBe('string');
        (0, vitest_1.expect)(task.outputData?.result).toBe('CREATE');
    });
    (0, vitest_1.it)('listResultShouldBeCorrectlyExtracted', async () => {
        const jsonJqTransform = new JsonJqTransform_1.JsonJqTransform();
        const workflow = {};
        const inputData = { request: { transitions: [{ name: 'redeliver' }, { name: 'redeliver_from_validation_error' }, { name: 'redelivery' }] } };
        const task = {
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
        await jsonJqTransform.start(workflow, task, {});
        (0, vitest_1.expect)(task.outputData?.error).toBeUndefined();
        (0, vitest_1.expect)(Array.isArray(task.outputData?.result)).toBe(true);
        (0, vitest_1.expect)((task.outputData?.result).length).toBe(3);
    });
    (0, vitest_1.it)('nullResultShouldBeCorrectlyExtracted', async () => {
        const jsonJqTransform = new JsonJqTransform_1.JsonJqTransform();
        const workflow = {};
        const task = {
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
        await jsonJqTransform.start(workflow, task, {});
        (0, vitest_1.expect)(task.outputData?.error).toBeUndefined();
        (0, vitest_1.expect)(task.outputData?.result).toBeNull();
    });
});
//# sourceMappingURL=JsonJqTransform.test.js.map