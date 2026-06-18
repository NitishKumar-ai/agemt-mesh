import { describe, expect, it, vi } from 'vitest';
import {
  TaskType,
  TaskStatus,
  isTaskTerminal,
  isTaskSuccessful,
  type WorkflowTask,
} from '@agentmesh/common';
import {
  SystemTaskRegistry,
  WorkflowSystemTask,
  Noop,
  Fork,
  Join,
  ExclusiveJoin,
  Terminate,
  TERMINATION_STATUS_PARAMETER,
  TERMINATION_REASON_PARAMETER,
  createTaskModel,
  createWorkflowModel,
  copyTaskModel,
  type TaskModel,
  type WorkflowModel,
  type WorkflowExecutor,
  type TaskMapper,
  TaskMapperContext,
  SimpleTaskMapper,
  ForkJoinTaskMapper,
  SwitchTaskMapper,
  TerminateTaskMapper,
  DeciderService,
  DeciderOutcome,
  getTaskByRefName,
  getNextTask,
  workflowTaskHas,
} from '../src/index.js';

function mockExecutor(): WorkflowExecutor {
  return {
    resetCallbacksForWorkflow: vi.fn(),
    rerun: vi.fn(() => ''),
    restart: vi.fn(),
    retry: vi.fn(),
    updateTask: vi.fn(() => null),
    getTask: vi.fn(() => null),
    getRunningWorkflows: vi.fn(() => []),
    getWorkflows: vi.fn(() => []),
    getRunningWorkflowIds: vi.fn(() => []),
    decide: vi.fn(() => null),
    decideWithLock: vi.fn(() => null),
    terminateWorkflow: vi.fn(),
    terminateWorkflowWithFailure: vi.fn(() => createWorkflowModel()),
    pauseWorkflow: vi.fn(),
    resumeWorkflow: vi.fn(),
    skipTaskFromWorkflow: vi.fn(),
    getWorkflow: vi.fn(() => null),
    scheduleNextIteration: vi.fn(),
    startWorkflow: vi.fn(() => ''),
    startWorkflowIdempotent: vi.fn(() => createWorkflowModel()),
  };
}

describe('types', () => {
  it('createTaskModel fills defaults', () => {
    const t = createTaskModel({ taskId: 't1', taskType: 'SIMPLE' });
    expect(t.taskId).toBe('t1');
    expect(t.taskType).toBe('SIMPLE');
    expect(t.status).toBe('SCHEDULED');
    expect(t.retryCount).toBe(0);
  });

  it('createWorkflowModel fills defaults', () => {
    const w = createWorkflowModel({ workflowId: 'wf1', workflowName: 'test' });
    expect(w.workflowId).toBe('wf1');
    expect(w.workflowName).toBe('test');
    expect(w.status).toBe('RUNNING');
    expect(w.tasks).toEqual([]);
  });

  it('copyTaskModel deep-copies input/output', () => {
    const t = createTaskModel({ inputData: { a: 1 }, outputData: { b: 2 } });
    const c = copyTaskModel(t);
    expect(c.inputData).toEqual({ a: 1 });
    expect(c.outputData).toEqual({ b: 2 });
    c.inputData['a'] = 99;
    expect(t.inputData['a']).toBe(1);
  });
});

describe('SystemTaskRegistry', () => {
  it('registers and retrieves tasks', () => {
    const r = new SystemTaskRegistry([new Noop(), new Fork()]);
    expect(r.get('NOOP')).toBeInstanceOf(Noop);
    expect(r.get('FORK_JOIN')).toBeInstanceOf(Fork);
    expect(r.isSystemTask('NOOP')).toBe(true);
    expect(r.isSystemTask('UNKNOWN')).toBe(false);
  });

  it('throws for unknown task', () => {
    const r = new SystemTaskRegistry([]);
    expect(() => r.get('NOOP')).toThrow('not found');
  });
});

describe('WorkflowSystemTask', () => {
  class TestTask extends WorkflowSystemTask {
    constructor() {
      super('TEST');
    }
  }

  it('has defaults', () => {
    const t = new TestTask();
    expect(t.taskType).toBe('TEST');
    expect(t.isAsync()).toBe(false);
    expect(t.isTaskRetrievalRequired()).toBe(true);
  });

  it('isAsyncComplete reads from inputData or workflowTask', () => {
    const t = new TestTask();
    const task = createTaskModel({ inputData: { asyncComplete: true } });
    expect(t.isAsyncComplete(task)).toBe(true);
    task.inputData = {};
    task.workflowTask = { asyncComplete: true } as WorkflowTask;
    expect(t.isAsyncComplete(task)).toBe(true);
  });
});

describe('Noop task', () => {
  it('marks task COMPLETED', () => {
    const noop = new Noop();
    const wf = createWorkflowModel();
    const task = createTaskModel({ status: 'IN_PROGRESS' });
    const result = noop.execute(wf, task, mockExecutor());
    expect(result).toBe(true);
    expect(task.status).toBe('COMPLETED');
  });
});

describe('Fork task', () => {
  it('is a marker task (execute returns false)', () => {
    const fork = new Fork();
    const wf = createWorkflowModel();
    const task = createTaskModel({ status: 'IN_PROGRESS' });
    const result = fork.execute(wf, task, mockExecutor());
    expect(result).toBe(false);
  });
});

describe('Terminate task', () => {
  it('completes with valid terminationStatus', () => {
    const terminate = new Terminate();
    const wf = createWorkflowModel();
    const task = createTaskModel({
      status: 'IN_PROGRESS',
      inputData: {
        [TERMINATION_STATUS_PARAMETER]: 'COMPLETED',
        [TERMINATION_REASON_PARAMETER]: 'done',
      },
    });
    const result = terminate.execute(wf, task, mockExecutor());
    expect(result).toBe(true);
    expect(task.status).toBe('COMPLETED');
  });

  it('fails with invalid terminationStatus', () => {
    const terminate = new Terminate();
    const wf = createWorkflowModel();
    const task = createTaskModel({
      status: 'IN_PROGRESS',
      inputData: { [TERMINATION_STATUS_PARAMETER]: 'PAUSED' },
    });
    const result = terminate.execute(wf, task, mockExecutor());
    expect(result).toBe(false);
    expect(task.status).toBe('FAILED');
  });
});

describe('Join task', () => {
  it('completes when all joinOn tasks are terminal and successful', () => {
    const join = new Join();
    const forkedTask1 = createTaskModel({
      referenceTaskName: 't1',
      status: 'COMPLETED',
      outputData: { x: 1 },
    });
    const forkedTask2 = createTaskModel({
      referenceTaskName: 't2',
      status: 'COMPLETED',
      outputData: { y: 2 },
    });
    const wf = createWorkflowModel({ tasks: [forkedTask1, forkedTask2] });
    const task = createTaskModel({ status: 'IN_PROGRESS', inputData: { joinOn: ['t1', 't2'] } });
    const result = join.execute(wf, task, mockExecutor());
    expect(result).toBe(true);
    expect(task.status).toBe('COMPLETED');
    expect(task.outputData['t1']).toEqual({ x: 1 });
    expect(task.outputData['t2']).toEqual({ y: 2 });
  });

  it('fails when a joinOn task failed (non-optional)', () => {
    const join = new Join();
    const forkedTask1 = createTaskModel({ referenceTaskName: 't1', status: 'FAILED' });
    const forkedTask2 = createTaskModel({ referenceTaskName: 't2', status: 'COMPLETED' });
    const wf = createWorkflowModel({ tasks: [forkedTask1, forkedTask2] });
    const task = createTaskModel({ status: 'IN_PROGRESS', inputData: { joinOn: ['t1', 't2'] } });
    const result = join.execute(wf, task, mockExecutor());
    expect(result).toBe(true);
    expect(task.status).toBe('FAILED');
  });
});

describe('ExclusiveJoin task', () => {
  it('completes when any joinOn task is terminal', () => {
    const ej = new ExclusiveJoin();
    const forkedTask = createTaskModel({
      referenceTaskName: 't1',
      status: 'COMPLETED',
      outputData: { z: 3 },
    });
    const wf = createWorkflowModel({ tasks: [forkedTask] });
    const task = createTaskModel({ status: 'IN_PROGRESS', inputData: { joinOn: ['t1', 't2'] } });
    const result = ej.execute(wf, task, mockExecutor());
    expect(result).toBe(true);
    expect(task.status).toBe('COMPLETED');
    expect(task.outputData['t1']).toEqual({ z: 3 });
  });
});

describe('SimpleTaskMapper', () => {
  it('creates a single SIMPLE task model', () => {
    const mapper = new SimpleTaskMapper();
    const wfTask: WorkflowTask = {
      name: 'test_task',
      taskReferenceName: 'ref1',
      type: 'SIMPLE',
      inputParameters: { url: 'http://example.com' },
      startDelay: 0,
      optional: false,
      asyncComplete: false,
      permissive: false,
      joinOn: [],
      defaultCase: [],
      decisionCases: {},
      forkTasks: [],
      loopOver: [],
      defaultExclusiveJoinTask: [],
      onStateChange: {},
    };
    const wf = createWorkflowModel({ workflowId: 'wf1', workflowName: 'test' });
    const ctx = new TaskMapperContext({
      workflowModel: wf,
      workflowTask: wfTask,
      taskInput: wfTask.inputParameters,
      taskDefinition: null,
      retryCount: 0,
      retryTaskId: null,
      taskId: 'task1',
      deciderService: null as any,
    });
    const tasks = mapper.getMappedTasks(ctx);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.taskType).toBe('SIMPLE');
    expect(tasks[0]!.referenceTaskName).toBe('ref1');
    expect(tasks[0]!.status).toBe('SCHEDULED');
  });
});

describe('ForkJoinTaskMapper', () => {
  it('creates FORK_JOIN + branch tasks + JOIN', () => {
    const mapper = new ForkJoinTaskMapper();
    const wfTask: WorkflowTask = {
      name: 'fork',
      taskReferenceName: 'fork_ref',
      type: 'FORK_JOIN',
      inputParameters: {},
      forkTasks: [
        [
          {
            name: 'branch1',
            taskReferenceName: 'b1',
            type: 'SIMPLE',
            inputParameters: {},
            startDelay: 0,
            optional: false,
            asyncComplete: false,
            permissive: false,
            joinOn: [],
            defaultCase: [],
            decisionCases: {},
            forkTasks: [],
            loopOver: [],
            defaultExclusiveJoinTask: [],
            onStateChange: {},
          },
        ],
        [
          {
            name: 'branch2',
            taskReferenceName: 'b2',
            type: 'SIMPLE',
            inputParameters: {},
            startDelay: 0,
            optional: false,
            asyncComplete: false,
            permissive: false,
            joinOn: [],
            defaultCase: [],
            decisionCases: {},
            forkTasks: [],
            loopOver: [],
            defaultExclusiveJoinTask: [],
            onStateChange: {},
          },
        ],
      ] as WorkflowTask[][],
      startDelay: 0,
      optional: false,
      asyncComplete: false,
      permissive: false,
      joinOn: [],
      defaultCase: [],
      decisionCases: {},
      loopOver: [],
      defaultExclusiveJoinTask: [],
      onStateChange: {},
    };
    const wfDef = {
      name: 'test_wf',
      version: 1,
      tasks: [
        wfTask,
        {
          name: 'join',
          taskReferenceName: 'join_ref',
          type: 'JOIN',
          inputParameters: {},
          startDelay: 0,
          optional: false,
          asyncComplete: false,
          permissive: false,
          joinOn: [],
          defaultCase: [],
          decisionCases: {},
          forkTasks: [],
          loopOver: [],
          defaultExclusiveJoinTask: [],
          onStateChange: {},
        },
      ],
      inputParameters: [],
      outputParameters: {},
      schemaVersion: 2,
      restartable: true,
      workflowStatusListenerEnabled: false,
      timeoutPolicy: 'ALERT_ONLY',
      timeoutSeconds: 0,
      variables: {},
      inputTemplate: {},
      enforceSchema: true,
      metadata: {},
      maskedFields: [],
    };
    const wf = createWorkflowModel({
      workflowId: 'wf1',
      workflowName: 'test',
      workflowDefinition: wfDef as any,
    });

    const decider = new DeciderService({
      taskMappers: {
        FORK_JOIN: mapper,
        JOIN: new (class implements TaskMapper {
          getTaskType() {
            return 'JOIN';
          }
          getMappedTasks(ctx: TaskMapperContext) {
            const t = ctx.createTaskModel();
            t.taskType = 'JOIN';
            t.taskDefName = 'JOIN';
            t.status = 'IN_PROGRESS';
            return [t];
          }
        })(),
        USER_DEFINED: new SimpleTaskMapper(),
      },
      systemTaskRegistry: new SystemTaskRegistry([]),
    });

    const ctx = new TaskMapperContext({
      workflowModel: wf,
      workflowTask: wfTask,
      taskInput: {},
      taskDefinition: null,
      retryCount: 0,
      retryTaskId: null,
      taskId: 'fork1',
      deciderService: decider,
    });
    const tasks = mapper.getMappedTasks(ctx);
    expect(tasks.length).toBeGreaterThanOrEqual(3);
    const forkTask = tasks.find((t) => t.taskType === 'FORK_JOIN');
    expect(forkTask).toBeTruthy();
    expect(forkTask!.status).toBe('COMPLETED');
  });
});

describe('SwitchTaskMapper', () => {
  it('creates SWITCH task with case branch', () => {
    const mapper = new SwitchTaskMapper();
    const wfTask: WorkflowTask = {
      name: 'switch',
      taskReferenceName: 'switch_ref',
      type: 'SWITCH',
      inputParameters: { inputCase: 'case1' },
      expression: 'inputCase',
      decisionCases: {
        case1: [
          {
            name: 'case1_task',
            taskReferenceName: 'c1',
            type: 'SIMPLE',
            inputParameters: {},
            startDelay: 0,
            optional: false,
            asyncComplete: false,
            permissive: false,
            joinOn: [],
            defaultCase: [],
            decisionCases: {},
            forkTasks: [],
            loopOver: [],
            defaultExclusiveJoinTask: [],
            onStateChange: {},
          },
        ],
      },
      defaultCase: [],
      startDelay: 0,
      optional: false,
      asyncComplete: false,
      permissive: false,
      joinOn: [],
      forkTasks: [],
      loopOver: [],
      defaultExclusiveJoinTask: [],
      onStateChange: {},
    } as WorkflowTask;
    const wf = createWorkflowModel({ workflowId: 'wf1' });
    const decider = new DeciderService({
      taskMappers: { SWITCH: mapper, USER_DEFINED: new SimpleTaskMapper() },
      systemTaskRegistry: new SystemTaskRegistry([]),
    });
    const ctx = new TaskMapperContext({
      workflowModel: wf,
      workflowTask: wfTask,
      taskInput: { inputCase: 'case1' },
      taskDefinition: null,
      retryCount: 0,
      retryTaskId: null,
      taskId: 'switch1',
      deciderService: decider,
    });
    const tasks = mapper.getMappedTasks(ctx);
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    const switchTask = tasks.find((t) => t.taskType === 'SWITCH');
    expect(switchTask).toBeTruthy();
    expect(switchTask!.status).toBe('IN_PROGRESS');
    expect(switchTask!.outputData['evaluationResult']).toEqual(['case1']);
  });
});

describe('TerminateTaskMapper', () => {
  it('creates a TERMINATE task model', () => {
    const mapper = new TerminateTaskMapper();
    const wfTask: WorkflowTask = {
      name: 'terminate',
      taskReferenceName: 'term_ref',
      type: 'TERMINATE',
      inputParameters: { terminationStatus: 'COMPLETED' },
      startDelay: 0,
      optional: false,
      asyncComplete: false,
      permissive: false,
      joinOn: [],
      defaultCase: [],
      decisionCases: {},
      forkTasks: [],
      loopOver: [],
      defaultExclusiveJoinTask: [],
      onStateChange: {},
    };
    const wf = createWorkflowModel({ workflowId: 'wf1' });
    const ctx = new TaskMapperContext({
      workflowModel: wf,
      workflowTask: wfTask,
      taskInput: { terminationStatus: 'COMPLETED' },
      taskDefinition: null,
      retryCount: 0,
      retryTaskId: null,
      taskId: 'term1',
      deciderService: null as any,
    });
    const tasks = mapper.getMappedTasks(ctx);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.taskType).toBe('TERMINATE');
    expect(tasks[0]!.status).toBe('SCHEDULED');
  });
});

describe('getTaskByRefName / getNextTask helpers', () => {
  const taskA: WorkflowTask = {
    name: 'a',
    taskReferenceName: 'a',
    type: 'SIMPLE',
    inputParameters: {},
    startDelay: 0,
    optional: false,
    asyncComplete: false,
    permissive: false,
    joinOn: [],
    defaultCase: [],
    decisionCases: {},
    forkTasks: [],
    loopOver: [],
    defaultExclusiveJoinTask: [],
    onStateChange: {},
  };
  const taskB: WorkflowTask = {
    name: 'b',
    taskReferenceName: 'b',
    type: 'SIMPLE',
    inputParameters: {},
    startDelay: 0,
    optional: false,
    asyncComplete: false,
    permissive: false,
    joinOn: [],
    defaultCase: [],
    decisionCases: {},
    forkTasks: [],
    loopOver: [],
    defaultExclusiveJoinTask: [],
    onStateChange: {},
  };
  const def = {
    name: 'test',
    version: 1,
    tasks: [taskA, taskB],
    inputParameters: [],
    outputParameters: {},
    schemaVersion: 2,
    restartable: true,
    workflowStatusListenerEnabled: false,
    timeoutPolicy: 'ALERT_ONLY' as const,
    timeoutSeconds: 0,
    variables: {},
    inputTemplate: {},
    enforceSchema: true,
    metadata: {},
    maskedFields: [],
  };

  it('getTaskByRefName finds task', () => {
    expect(getTaskByRefName(def as any, 'a')?.taskReferenceName).toBe('a');
    expect(getTaskByRefName(def as any, 'nonexistent')).toBeNull();
  });

  it('getNextTask returns next task', () => {
    expect(getNextTask(def as any, 'a')?.taskReferenceName).toBe('b');
    expect(getNextTask(def as any, 'b')).toBeNull();
  });
});

describe('workflowTaskHas', () => {
  it('checks loopOver containment', () => {
    const inner: WorkflowTask = {
      name: 'inner',
      taskReferenceName: 'inner',
      type: 'SIMPLE',
      inputParameters: {},
      startDelay: 0,
      optional: false,
      asyncComplete: false,
      permissive: false,
      joinOn: [],
      defaultCase: [],
      decisionCases: {},
      forkTasks: [],
      loopOver: [],
      defaultExclusiveJoinTask: [],
      onStateChange: {},
    };
    const wft: WorkflowTask = {
      name: 'loop',
      taskReferenceName: 'loop',
      type: 'DO_WHILE',
      inputParameters: {},
      loopOver: [inner],
      startDelay: 0,
      optional: false,
      asyncComplete: false,
      permissive: false,
      joinOn: [],
      defaultCase: [],
      decisionCases: {},
      forkTasks: [],
      defaultExclusiveJoinTask: [],
      onStateChange: {},
    };
    expect(workflowTaskHas(wft, 'inner')).toBe(true);
    expect(workflowTaskHas(wft, 'nonexistent')).toBe(false);
  });
});
