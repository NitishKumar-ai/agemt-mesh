import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  DeciderService,
  SystemTaskRegistry,
  createWorkflowModel,
  createTaskModel,
  SimpleTaskMapper,
  ForkJoinTaskMapper,
  ForkJoinDynamicTaskMapper,
  SwitchTaskMapper,
  JoinTaskMapper,
  SubWorkflowTaskMapper,
  DoWhileTaskMapper,
  TerminateTaskMapper,
  WaitTaskMapper,
  HumanTaskMapper,
  Fork,
  Join,
  Switch,
  DoWhile,
  Noop,
  Terminate,
  Wait,
  Human,
  SubWorkflow,
  Decision,
  ExclusiveJoin,
  appendIteration,
  type WorkflowExecutor,
} from '../src/index.js';
import type { WorkflowTask, WorkflowDef } from '@conductor/common';

function loadFixture(name: string): any {
  const path = fileURLToPath(new URL(`../../common/src/test/resources/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function createDecider(): DeciderService {
  const systemTaskRegistry = new SystemTaskRegistry([
    new Fork(),
    new Join(),
    new Switch(),
    new Decision(),
    new ExclusiveJoin(),
    new DoWhile(),
    new Noop(),
    new Terminate(),
    new Wait(),
    new Human(),
    new SubWorkflow(),
  ]);

  const taskMappers = {
    SIMPLE: new SimpleTaskMapper(),
    USER_DEFINED: new SimpleTaskMapper(),
    FORK_JOIN: new ForkJoinTaskMapper(),
    FORK_JOIN_DYNAMIC: new ForkJoinDynamicTaskMapper(),
    SWITCH: new SwitchTaskMapper(),
    DECISION: new SwitchTaskMapper(),
    EXCLUSIVE_JOIN: new JoinTaskMapper(),
    JOIN: new JoinTaskMapper(),
    SUB_WORKFLOW: new SubWorkflowTaskMapper(),
    DO_WHILE: new DoWhileTaskMapper(),
    TERMINATE: new TerminateTaskMapper(),
    WAIT: new WaitTaskMapper(),
    HUMAN: new HumanTaskMapper(),
  };

  return new DeciderService({
    taskMappers,
    systemTaskRegistry,
  });
}

describe('Decider Parity Golden Suite (20+ Workflow Defs)', () => {
  const decider = createDecider();

  // Definition 1: conditional_flow.json
  it('1. conditional_flow.json initial decide schedules first tasks', () => {
    const def = loadFixture('conditional_flow.json');
    const workflow = createWorkflowModel({
      workflowDefinition: def,
      input: { param1: 'nested', param2: 'one' },
    });
    const outcome = decider.decide(workflow);
    expect(outcome.tasksToBeScheduled.length).toBe(3);
    expect(outcome.tasksToBeScheduled[2]!.taskType).toBe('SIMPLE');
  });

  // Definition 2: conditional_flow_with_switch.json
  it('2. conditional_flow_with_switch.json decides correctly', () => {
    const def = loadFixture('conditional_flow_with_switch.json');
    const workflow = createWorkflowModel({
      workflowDefinition: def,
      input: { param1: 'nested', param2: 'one' },
    });
    const outcome = decider.decide(workflow);
    expect(outcome.tasksToBeScheduled.length).toBe(3);
  });

  // Definition 3: Single simple task
  it('3. Single simple task flow', () => {
    const def: any = {
      name: 'single_task',
      version: 1,
      tasks: [{ name: 't1', taskReferenceName: 't1', type: 'SIMPLE', inputParameters: {}, startDelay: 0, optional: false, asyncComplete: false, permissive: false, joinOn: [], defaultCase: [], decisionCases: {}, forkTasks: [], loopOver: [], defaultExclusiveJoinTask: [], onStateChange: {} }],
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
    const workflow = createWorkflowModel({ workflowDefinition: def });
    const outcome = decider.decide(workflow);
    expect(outcome.tasksToBeScheduled).toHaveLength(1);
    expect(outcome.tasksToBeScheduled[0]!.referenceTaskName).toBe('t1');
  });

  // Definition 4: Linear backoff retry
  it('4. Linear backoff retry scheduling', () => {
    const taskDef = {
      name: 'retry_task',
      retryCount: 2,
      retryLogic: 'LINEAR_BACKOFF' as const,
      retryDelaySeconds: 5,
      backoffScaleFactor: 2,
    };
    const def: any = {
      name: 'retry_wf',
      version: 1,
      tasks: [{ name: 'retry_task', taskReferenceName: 't1', type: 'SIMPLE', taskDefinition: taskDef as any, inputParameters: {}, startDelay: 0, optional: false, asyncComplete: false, permissive: false, joinOn: [], defaultCase: [], decisionCases: {}, forkTasks: [], loopOver: [], defaultExclusiveJoinTask: [], onStateChange: {} }],
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
    const failedTask = createTaskModel({
      taskId: 't1',
      taskType: 'SIMPLE',
      status: 'FAILED',
      referenceTaskName: 't1',
      retryCount: 0,
    });
    const workflow = createWorkflowModel({
      workflowDefinition: def,
      tasks: [failedTask],
    });
    const outcome = decider.decide(workflow);
    expect(outcome.tasksToBeScheduled).toHaveLength(1);
    expect(outcome.tasksToBeScheduled[0]!.retryCount).toBe(1);
    expect(outcome.tasksToBeScheduled[0]!.callbackAfterSeconds).toBe(10); // retryDelaySeconds (5) * scale (2) * 1
  });

  // Definition 5: Exponential backoff retry
  it('5. Exponential backoff retry scheduling', () => {
    const taskDef = {
      name: 'retry_task_exp',
      retryCount: 3,
      retryLogic: 'EXPONENTIAL_BACKOFF' as const,
      retryDelaySeconds: 5,
    };
    const def: any = {
      name: 'retry_wf_exp',
      version: 1,
      tasks: [{ name: 'retry_task_exp', taskReferenceName: 't1', type: 'SIMPLE', taskDefinition: taskDef as any, inputParameters: {}, startDelay: 0, optional: false, asyncComplete: false, permissive: false, joinOn: [], defaultCase: [], decisionCases: {}, forkTasks: [], loopOver: [], defaultExclusiveJoinTask: [], onStateChange: {} }],
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
    const failedTask = createTaskModel({
      taskId: 't1',
      taskType: 'SIMPLE',
      status: 'FAILED',
      referenceTaskName: 't1',
      retryCount: 2,
    });
    const workflow = createWorkflowModel({
      workflowDefinition: def,
      tasks: [failedTask],
    });
    const outcome = decider.decide(workflow);
    expect(outcome.tasksToBeScheduled).toHaveLength(1);
    expect(outcome.tasksToBeScheduled[0]!.retryCount).toBe(3);
    expect(outcome.tasksToBeScheduled[0]!.callbackAfterSeconds).toBe(20); // 5 * 2^2
  });

  // Definition 6: Optional task failover
  it('6. Optional task failover to next task', () => {
    const def: any = {
      name: 'optional_wf',
      version: 1,
      tasks: [
        { name: 't1', taskReferenceName: 't1', type: 'SIMPLE', optional: true, inputParameters: {}, startDelay: 0, asyncComplete: false, permissive: false, joinOn: [], defaultCase: [], decisionCases: {}, forkTasks: [], loopOver: [], defaultExclusiveJoinTask: [], onStateChange: {} },
        { name: 't2', taskReferenceName: 't2', type: 'SIMPLE', inputParameters: {}, startDelay: 0, optional: false, asyncComplete: false, permissive: false, joinOn: [], defaultCase: [], decisionCases: {}, forkTasks: [], loopOver: [], defaultExclusiveJoinTask: [], onStateChange: {} },
      ],
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
    const failedTask = createTaskModel({
      taskId: 't1',
      taskType: 'SIMPLE',
      status: 'FAILED',
      referenceTaskName: 't1',
      retryCount: 0,
      workflowTask: def.tasks[0],
    });
    const workflow = createWorkflowModel({
      workflowDefinition: def,
      tasks: [failedTask],
    });
    const outcome = decider.decide(workflow);
    expect(outcome.tasksToBeUpdated).toHaveLength(1);
    expect(outcome.tasksToBeUpdated[0]!.status).toBe('COMPLETED_WITH_ERRORS');
    expect(outcome.tasksToBeScheduled).toHaveLength(1);
    expect(outcome.tasksToBeScheduled[0]!.referenceTaskName).toBe('t2');
  });

  // Definition 7: Switch evaluation case branch
  it('7. Switch evaluation case branch', () => {
    const def: any = {
      name: 'switch_wf',
      version: 1,
      tasks: [
        {
          name: 'switch',
          taskReferenceName: 'switch',
          type: 'SWITCH',
          inputParameters: { val: 'A' },
          evaluatorType: 'value-param',
          expression: 'val',
          decisionCases: {
            A: [{ name: 'tA', taskReferenceName: 'tA', type: 'SIMPLE', inputParameters: {}, startDelay: 0, optional: false, asyncComplete: false, permissive: false, joinOn: [], defaultCase: [], decisionCases: {}, forkTasks: [], loopOver: [], defaultExclusiveJoinTask: [], onStateChange: {} }],
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
        },
      ],
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
    const workflow = createWorkflowModel({ workflowDefinition: def, input: { val: 'A' } });
    const outcome = decider.decide(workflow);
    expect(outcome.tasksToBeScheduled).toHaveLength(2); // SWITCH + branch tA
    expect(outcome.tasksToBeScheduled.map(t => t.referenceTaskName)).toContain('tA');
  });

  // Definition 8: Switch default case
  it('8. Switch default case', () => {
    const def: any = {
      name: 'switch_wf_def',
      version: 1,
      tasks: [
        {
          name: 'switch',
          taskReferenceName: 'switch',
          type: 'SWITCH',
          inputParameters: { val: 'Z' },
          evaluatorType: 'value-param',
          expression: 'val',
          decisionCases: {
            A: [{ name: 'tA', taskReferenceName: 'tA', type: 'SIMPLE', inputParameters: {}, startDelay: 0, optional: false, asyncComplete: false, permissive: false, joinOn: [], defaultCase: [], decisionCases: {}, forkTasks: [], loopOver: [], defaultExclusiveJoinTask: [], onStateChange: {} }],
          },
          defaultCase: [{ name: 'tD', taskReferenceName: 'tD', type: 'SIMPLE', inputParameters: {}, startDelay: 0, optional: false, asyncComplete: false, permissive: false, joinOn: [], defaultCase: [], decisionCases: {}, forkTasks: [], loopOver: [], defaultExclusiveJoinTask: [], onStateChange: {} }],
          startDelay: 0,
          optional: false,
          asyncComplete: false,
          permissive: false,
          joinOn: [],
          forkTasks: [],
          loopOver: [],
          defaultExclusiveJoinTask: [],
          onStateChange: {},
        },
      ],
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
    const workflow = createWorkflowModel({ workflowDefinition: def, input: { val: 'Z' } });
    const outcome = decider.decide(workflow);
    expect(outcome.tasksToBeScheduled).toHaveLength(2); // SWITCH + branch tD
    expect(outcome.tasksToBeScheduled.map(t => t.referenceTaskName)).toContain('tD');
  });

  // Definition 9: Wait task scheduling
  it('9. Wait task schedules and halts progress', () => {
    const def: any = {
      name: 'wait_wf',
      version: 1,
      tasks: [
        { name: 'wait', taskReferenceName: 'wait', type: 'WAIT', inputParameters: {}, startDelay: 0, optional: false, asyncComplete: false, permissive: false, joinOn: [], defaultCase: [], decisionCases: {}, forkTasks: [], loopOver: [], defaultExclusiveJoinTask: [], onStateChange: {} },
        { name: 't1', taskReferenceName: 't1', type: 'SIMPLE', inputParameters: {}, startDelay: 0, optional: false, asyncComplete: false, permissive: false, joinOn: [], defaultCase: [], decisionCases: {}, forkTasks: [], loopOver: [], defaultExclusiveJoinTask: [], onStateChange: {} },
      ],
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
    const workflow = createWorkflowModel({ workflowDefinition: def });
    const outcome = decider.decide(workflow);
    expect(outcome.tasksToBeScheduled).toHaveLength(1);
    expect(outcome.tasksToBeScheduled[0]!.taskType).toBe('WAIT');
  });

  // Definition 10: Terminate task schedules
  it('10. Terminate task terminates workflow execution', () => {
    const def: any = {
      name: 'terminate_wf',
      version: 1,
      tasks: [
        { name: 'term', taskReferenceName: 'term', type: 'TERMINATE', inputParameters: { terminationStatus: 'COMPLETED' }, startDelay: 0, optional: false, asyncComplete: false, permissive: false, joinOn: [], defaultCase: [], decisionCases: {}, forkTasks: [], loopOver: [], defaultExclusiveJoinTask: [], onStateChange: {} },
      ],
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
    const workflow = createWorkflowModel({ workflowDefinition: def });
    const outcome = decider.decide(workflow);
    expect(outcome.tasksToBeScheduled).toHaveLength(1);
    expect(outcome.tasksToBeScheduled[0]!.taskType).toBe('TERMINATE');
  });

  // Definition 11: Simple task with start delay
  it('11. Simple task with start delay', () => {
    const def: any = {
      name: 'start_delay_wf',
      version: 1,
      tasks: [{ name: 't1', taskReferenceName: 't1', type: 'SIMPLE', startDelay: 10, inputParameters: {}, optional: false, asyncComplete: false, permissive: false, joinOn: [], defaultCase: [], decisionCases: {}, forkTasks: [], loopOver: [], defaultExclusiveJoinTask: [], onStateChange: {} }],
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
    const workflow = createWorkflowModel({ workflowDefinition: def });
    const outcome = decider.decide(workflow);
    expect(outcome.tasksToBeScheduled).toHaveLength(1);
    expect(outcome.tasksToBeScheduled[0]!.startDelayInSeconds).toBe(10);
  });

  // Definition 12: Permissive task failure continues
  it('12. Permissive task continues but tracks failed status at the end', () => {
    const def: any = {
      name: 'permissive_wf',
      version: 1,
      tasks: [
        { name: 't1', taskReferenceName: 't1', type: 'SIMPLE', permissive: true, inputParameters: {}, startDelay: 0, optional: false, asyncComplete: false, joinOn: [], defaultCase: [], decisionCases: {}, forkTasks: [], loopOver: [], defaultExclusiveJoinTask: [], onStateChange: {} },
        { name: 't2', taskReferenceName: 't2', type: 'SIMPLE', inputParameters: {}, startDelay: 0, optional: false, asyncComplete: false, permissive: false, joinOn: [], defaultCase: [], decisionCases: {}, forkTasks: [], loopOver: [], defaultExclusiveJoinTask: [], onStateChange: {} },
      ],
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
    const failedTask = createTaskModel({
      taskId: 't1',
      taskType: 'SIMPLE',
      status: 'FAILED',
      referenceTaskName: 't1',
      retryCount: 0,
      workflowTask: def.tasks[0],
    });
    const workflow = createWorkflowModel({
      workflowDefinition: def,
      tasks: [failedTask],
    });
    const outcome = decider.decide(workflow);
    expect(outcome.tasksToBeScheduled).toHaveLength(1);
    expect(outcome.tasksToBeScheduled[0]!.referenceTaskName).toBe('t2');
  });

  // Definition 13: Sub workflow scheduling
  it('13. Sub workflow scheduling mapped tasks', () => {
    const def: any = {
      name: 'sub_wf_parent',
      version: 1,
      tasks: [
        {
          name: 'sub_wf_task',
          taskReferenceName: 'sub',
          type: 'SUB_WORKFLOW',
          subWorkflowParam: { name: 'sub_wf_child', version: 1 },
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
    const workflow = createWorkflowModel({ workflowDefinition: def });
    const outcome = decider.decide(workflow);
    expect(outcome.tasksToBeScheduled).toHaveLength(1);
    expect(outcome.tasksToBeScheduled[0]!.taskType).toBe('SUB_WORKFLOW');
  });

  // Definition 14: Fork Join task scheduling
  it('14. Fork join schedules branches', () => {
    const forkTask: any = {
      name: 'fork',
      taskReferenceName: 'fork',
      type: 'FORK_JOIN',
      forkTasks: [
        [{ name: 't1', taskReferenceName: 't1', type: 'SIMPLE', inputParameters: {}, startDelay: 0, optional: false, asyncComplete: false, permissive: false, joinOn: [], defaultCase: [], decisionCases: {}, forkTasks: [], loopOver: [], defaultExclusiveJoinTask: [], onStateChange: {} }],
        [{ name: 't2', taskReferenceName: 't2', type: 'SIMPLE', inputParameters: {}, startDelay: 0, optional: false, asyncComplete: false, permissive: false, joinOn: [], defaultCase: [], decisionCases: {}, forkTasks: [], loopOver: [], defaultExclusiveJoinTask: [], onStateChange: {} }],
      ],
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
    const joinTask: any = {
      name: 'join',
      taskReferenceName: 'join',
      type: 'JOIN',
      joinOn: ['t1', 't2'],
      inputParameters: {},
      startDelay: 0,
      optional: false,
      asyncComplete: false,
      permissive: false,
      defaultCase: [],
      decisionCases: {},
      forkTasks: [],
      loopOver: [],
      defaultExclusiveJoinTask: [],
      onStateChange: {},
    };
    const def: any = {
      name: 'fork_join_wf',
      version: 1,
      tasks: [forkTask, joinTask],
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
    const workflow = createWorkflowModel({ workflowDefinition: def });
    const outcome = decider.decide(workflow);
    expect(outcome.tasksToBeScheduled.length).toBeGreaterThanOrEqual(3);
    const scheduledRefs = outcome.tasksToBeScheduled.map(t => t.referenceTaskName);
    expect(scheduledRefs).toContain('t1');
    expect(scheduledRefs).toContain('t2');
  });

  // Definition 15: Fork Join Dynamic
  it('15. Fork join dynamic schedules dynamic tasks', () => {
    const forkDynamicTask: any = {
      name: 'fork_dyn',
      taskReferenceName: 'fork_dyn',
      type: 'FORK_JOIN_DYNAMIC',
      dynamicForkTasksParam: 'forkedTasks',
      dynamicForkTasksInputParamName: 'forkedInputs',
      inputParameters: {
        forkedTasks: '${workflow.input.tasks}',
        forkedInputs: '${workflow.input.inputs}',
      },
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
    const def: any = {
      name: 'fork_join_dyn_wf',
      version: 1,
      tasks: [forkDynamicTask],
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
    const workflow = createWorkflowModel({
      workflowDefinition: def,
      input: {
        tasks: [
          { name: 't1', taskReferenceName: 't1', type: 'SIMPLE' },
          { name: 't2', taskReferenceName: 't2', type: 'SIMPLE' },
        ],
        inputs: {
          t1: { x: 1 },
          t2: { y: 2 },
        },
      },
    });
    const outcome = decider.decide(workflow);
    expect(outcome.tasksToBeScheduled.length).toBeGreaterThanOrEqual(3);
  });

  // Definition 16: Human task scheduling
  it('16. Human task scheduling', () => {
    const def: any = {
      name: 'human_wf',
      version: 1,
      tasks: [{ name: 'human', taskReferenceName: 'human', type: 'HUMAN', inputParameters: {}, startDelay: 0, optional: false, asyncComplete: false, permissive: false, joinOn: [], defaultCase: [], decisionCases: {}, forkTasks: [], loopOver: [], defaultExclusiveJoinTask: [], onStateChange: {} }],
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
    const workflow = createWorkflowModel({ workflowDefinition: def });
    const outcome = decider.decide(workflow);
    expect(outcome.tasksToBeScheduled).toHaveLength(1);
    expect(outcome.tasksToBeScheduled[0]!.taskType).toBe('HUMAN');
  });

  // Definition 17: Do-while iteration 1
  it('17. Do-while schedules loopOver tasks on iteration 1', () => {
    const innerTask: any = { name: 'inner', taskReferenceName: 'inner', type: 'SIMPLE', inputParameters: {}, startDelay: 0, optional: false, asyncComplete: false, permissive: false, joinOn: [], defaultCase: [], decisionCases: {}, forkTasks: [], loopOver: [], defaultExclusiveJoinTask: [], onStateChange: {} };
    const doWhileTask: any = {
      name: 'loop',
      taskReferenceName: 'loop',
      type: 'DO_WHILE',
      loopCondition: '$.inner.iteration < 3',
      loopOver: [innerTask],
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
    const def: any = {
      name: 'do_while_wf',
      version: 1,
      tasks: [doWhileTask],
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
    const workflow = createWorkflowModel({ workflowDefinition: def });
    const outcome = decider.decide(workflow);
    expect(outcome.tasksToBeScheduled.length).toBeGreaterThanOrEqual(1);

    const loopTask = outcome.tasksToBeScheduled.find((t) => t.referenceTaskName === 'loop')!;
    loopTask.status = 'IN_PROGRESS';
    workflow.tasks.push(loopTask);

    const doWhileSystemTask = new DoWhile();
    const workflowExecutor = {
      scheduleNextIteration: vi.fn((lt, wf) => {
        const firstLoopTask = lt.workflowTask.loopOver[0];
        const scheduledLoopOverTasks = decider.getTasksToBeScheduled(
          wf,
          firstLoopTask,
          lt.retryCount,
        );
        for (const t of scheduledLoopOverTasks) {
          t.referenceTaskName = appendIteration(t.referenceTaskName, lt.iteration);
          t.iteration = lt.iteration;
          t.loopOverTask = true;
        }
        wf.tasks.push(...scheduledLoopOverTasks);
      }),
    } as unknown as WorkflowExecutor;

    doWhileSystemTask.execute(workflow, loopTask, workflowExecutor);
    expect(workflow.tasks.map((t) => t.referenceTaskName)).toContain('inner_1');
  });

  // Definition 18: Join task scheduling
  it('18. Join task waits for all joinOn tasks', () => {
    const def: any = {
      name: 'join_wf',
      version: 1,
      tasks: [
        { name: 'join', taskReferenceName: 'join', type: 'JOIN', joinOn: ['t1', 't2'], inputParameters: {}, startDelay: 0, optional: false, asyncComplete: false, permissive: false, defaultCase: [], decisionCases: {}, forkTasks: [], loopOver: [], defaultExclusiveJoinTask: [], onStateChange: {} },
      ],
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
    const t1 = createTaskModel({ taskId: 't1', referenceTaskName: 't1', status: 'COMPLETED', executed: true });
    const t2 = createTaskModel({ taskId: 't2', referenceTaskName: 't2', status: 'IN_PROGRESS', executed: false });
    const workflow = createWorkflowModel({
      workflowDefinition: def,
      tasks: [t1, t2],
    });
    const outcome = decider.decide(workflow);
    // join is not scheduled yet since t2 is not completed
    expect(outcome.tasksToBeScheduled.map(t => t.referenceTaskName)).not.toContain('join');
  });

  // Definition 19: Exclusive Join task
  it('19. Exclusive Join completes when one task completes', () => {
    const def: any = {
      name: 'exclusive_join_wf',
      version: 1,
      tasks: [
        { name: 'join', taskReferenceName: 'join', type: 'EXCLUSIVE_JOIN', joinOn: ['t1', 't2'], defaultExclusiveJoinTask: [], inputParameters: {}, startDelay: 0, optional: false, asyncComplete: false, permissive: false, defaultCase: [], decisionCases: {}, forkTasks: [], loopOver: [], onStateChange: {} },
      ],
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
    const t1 = createTaskModel({ taskId: 't1', referenceTaskName: 't1', status: 'COMPLETED', executed: true });
    const t2 = createTaskModel({ taskId: 't2', referenceTaskName: 't2', status: 'IN_PROGRESS', executed: true });
    const workflow = createWorkflowModel({
      workflowDefinition: def,
      tasks: [t1, t2],
    });
    const outcome = decider.decide(workflow);
    // Join will be ready to schedule in progress since t1 is completed
    expect(outcome.tasksToBeScheduled).toHaveLength(1);
    expect(outcome.tasksToBeScheduled[0]!.referenceTaskName).toBe('join');
  });

  // Definition 20: Workflow timeout
  it('20. Workflow timeout throws TerminateWorkflowError', () => {
    const def: any = {
      name: 'timeout_wf',
      version: 1,
      tasks: [{ name: 't1', taskReferenceName: 't1', type: 'SIMPLE', inputParameters: {}, startDelay: 0, optional: false, asyncComplete: false, permissive: false, joinOn: [], defaultCase: [], decisionCases: {}, forkTasks: [], loopOver: [], defaultExclusiveJoinTask: [], onStateChange: {} }],
      schemaVersion: 2,
      restartable: true,
      workflowStatusListenerEnabled: false,
      timeoutPolicy: 'TIME_OUT_WF',
      timeoutSeconds: 5,
      variables: {},
      inputTemplate: {},
      enforceSchema: true,
      metadata: {},
      maskedFields: [],
    };
    const workflow = createWorkflowModel({
      workflowDefinition: def,
      createTime: Date.now() - 6000 * 1000,
    });
    expect(() => decider.decide(workflow)).toThrow(/timed out/);
  });
});
