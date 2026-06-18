import { describe, expect, it } from 'vitest';

import {
  ConductorError,
  EnvUtils,
  NonRetryableError,
  RetryLogic,
  TaskDefSchema,
  TaskSchema,
  TaskStatus,
  TaskTimeoutPolicy,
  TaskType,
  WorkflowDefSchema,
  WorkflowSchema,
  WorkflowStatus,
  WorkflowTimeoutPolicy,
  isBuiltInTask,
  isTaskRetriable,
  isTaskSuccessful,
  isTaskTerminal,
  isWorkflowSuccessful,
  isWorkflowTerminal,
  workflowDefKey,
} from '../src/index.js';

describe('enums: TaskStatus flag parity with Java Task.Status', () => {
  it('terminal/successful/retriable triples match the Java enum ctor', () => {
    expect([
      isTaskTerminal(TaskStatus.IN_PROGRESS),
      isTaskSuccessful(TaskStatus.IN_PROGRESS),
      isTaskRetriable(TaskStatus.IN_PROGRESS),
    ]).toEqual([false, true, true]);

    expect([
      isTaskTerminal(TaskStatus.FAILED_WITH_TERMINAL_ERROR),
      isTaskSuccessful(TaskStatus.FAILED_WITH_TERMINAL_ERROR),
      isTaskRetriable(TaskStatus.FAILED_WITH_TERMINAL_ERROR),
    ]).toEqual([true, false, false]);

    expect(isTaskTerminal(TaskStatus.COMPLETED)).toBe(true);
    expect(isTaskRetriable(TaskStatus.SKIPPED)).toBe(false);
  });
});

describe('enums: WorkflowStatus flag parity', () => {
  it('matches Java Workflow.WorkflowStatus', () => {
    expect(isWorkflowTerminal(WorkflowStatus.RUNNING)).toBe(false);
    expect(isWorkflowSuccessful(WorkflowStatus.PAUSED)).toBe(true);
    expect(isWorkflowTerminal(WorkflowStatus.TERMINATED)).toBe(true);
    expect(isWorkflowSuccessful(WorkflowStatus.FAILED)).toBe(false);
  });
});

describe('enums: built-in tasks include legacy FORK alias', () => {
  it('FORK and FORK_JOIN are both built-in; USER_DEFINED is not', () => {
    expect(isBuiltInTask('FORK')).toBe(true);
    expect(isBuiltInTask(TaskType.FORK_JOIN)).toBe(true);
    expect(isBuiltInTask(TaskType.USER_DEFINED)).toBe(false);
  });
});

describe('TaskDefSchema: defaults mirror Java field initializers', () => {
  it('applies retryCount=3, FIXED, TIME_OUT_WF, responseTimeout=3600', () => {
    const def = TaskDefSchema.parse({ name: 'my_task' });
    expect(def.retryCount).toBe(3);
    expect(def.retryLogic).toBe(RetryLogic.FIXED);
    expect(def.timeoutPolicy).toBe(TaskTimeoutPolicy.TIME_OUT_WF);
    expect(def.retryDelaySeconds).toBe(60);
    expect(def.responseTimeoutSeconds).toBe(3600);
    expect(def.taskStatusListenerEnabled).toBe(true);
    expect(def.enforceSchema).toBe(false);
    // Auditable fields
    expect(def.createTime).toBe(0);
  });

  it('rejects empty name', () => {
    expect(() => TaskDefSchema.parse({ name: '' })).toThrow();
  });
});

describe('WorkflowDefSchema: defaults + recursive task tree', () => {
  it('applies version=1, schemaVersion=2, restartable, ALERT_ONLY', () => {
    const wf = WorkflowDefSchema.parse({ name: 'my_wf' });
    expect(wf.version).toBe(1);
    expect(wf.schemaVersion).toBe(2);
    expect(wf.restartable).toBe(true);
    expect(wf.enforceSchema).toBe(true);
    expect(wf.timeoutPolicy).toBe(WorkflowTimeoutPolicy.ALERT_ONLY);
  });

  it('round-trips a nested decision workflow through parse → JSON → parse', () => {
    const input = {
      name: 'decider_wf',
      tasks: [
        {
          name: 'switch_task',
          taskReferenceName: 'sw',
          type: TaskType.SWITCH,
          decisionCases: {
            yes: [{ name: 'a', taskReferenceName: 'a_ref' }],
          },
          defaultCase: [{ name: 'b', taskReferenceName: 'b_ref' }],
        },
      ],
    };
    const wf = WorkflowDefSchema.parse(input);
    const round = WorkflowDefSchema.parse(JSON.parse(JSON.stringify(wf)));
    expect(round.tasks[0]?.decisionCases.yes?.[0]?.name).toBe('a');
    expect(round.tasks[0]?.defaultCase[0]?.taskReferenceName).toBe('b_ref');
    // default applied deep in the tree
    expect(round.tasks[0]?.decisionCases.yes?.[0]?.type).toBe(TaskType.SIMPLE);
  });

  it('workflowDefKey builds name.version', () => {
    expect(workflowDefKey('my_wf', 3)).toBe('my_wf.3');
  });
});

describe('Runtime models: Workflow and Task instances', () => {
  it('WorkflowSchema handles circular history via lazy', () => {
    const wfData = {
      workflowId: 'wf1',
      status: WorkflowStatus.RUNNING,
      history: [
        {
          workflowId: 'wf1_prev',
          status: WorkflowStatus.FAILED,
        },
      ],
    };
    const wf = WorkflowSchema.parse(wfData);
    expect(wf.workflowId).toBe('wf1');
    expect(wf.history[0]?.workflowId).toBe('wf1_prev');
    expect(wf.history[0]?.status).toBe(WorkflowStatus.FAILED);
  });

  it('TaskSchema defaults', () => {
    const task = TaskSchema.parse({
      taskType: 'SIMPLE',
      status: TaskStatus.SCHEDULED,
      referenceTaskName: 't1',
    });
    expect(task.retryCount).toBe(0);
    expect(task.callbackFromWorker).toBe(true);
  });
});

describe('EnvUtils', () => {
  it('isEnvironmentVariable checks system params and process.env', () => {
    expect(EnvUtils.isEnvironmentVariable('CPEWF_TASK_ID')).toBe(true);
    process.env.TEST_VAR = 'exists';
    expect(EnvUtils.isEnvironmentVariable('TEST_VAR')).toBe(true);
    expect(EnvUtils.isEnvironmentVariable('NON_EXISTENT_VAR')).toBe(false);
  });

  it('getSystemParametersValue returns taskId for CPEWF_TASK_ID', () => {
    expect(EnvUtils.getSystemParametersValue('CPEWF_TASK_ID', 'task123')).toBe('task123');
  });
});

describe('Exceptions', () => {
  it('ConductorError captures cause', () => {
    const cause = new Error('root cause');
    const err = new ConductorError('wrapper', cause);
    expect(err.message).toBe('wrapper');
    expect(err.cause).toBe(cause);
  });

  it('NonRetryableError is a ConductorError', () => {
    const err = new NonRetryableError('terminal');
    expect(err).toBeInstanceOf(ConductorError);
    expect(err.name).toBe('NonRetryableError');
  });
});
