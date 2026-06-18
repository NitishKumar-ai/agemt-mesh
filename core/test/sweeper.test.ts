import { describe, expect, it, vi, beforeEach } from 'vitest';
import { isWorkflowTerminal, isTaskTerminal } from '@conductor/common';
import {
  WorkflowSweeper,
  createTaskModel,
  createWorkflowModel,
  SystemTaskRegistry,
  WorkflowSystemTask,
} from '../src/index.js';
import type {
  QueueDAO,
  ExecutionDAOFacade,
  ExecutionLockService,
  ConductorProperties,
  WorkflowExecutor,
  TaskModel,
} from '../src/index.js';

describe('WorkflowSweeper', () => {
  const WORKFLOW_ID = 'workflow-id';

  let queueDAO: QueueDAO;
  let workflowExecutor: WorkflowExecutor;
  let executionDAO: ExecutionDAOFacade;
  let properties: ConductorProperties;
  let systemTaskRegistry: SystemTaskRegistry;
  let executionLockService: ExecutionLockService;
  let sweeper: WorkflowSweeper;

  beforeEach(() => {
    queueDAO = {
      push: vi.fn(),
      pushDuration: vi.fn(),
      remove: vi.fn(),
      postpone: vi.fn(),
      setUnackTimeout: vi.fn(),
      containsMessage: vi.fn(() => false),
      resetOffsetTime: vi.fn(() => true),
    };

    workflowExecutor = {
      resetCallbacksForWorkflow: vi.fn(),
      rerun: vi.fn(() => ''),
      restart: vi.fn(),
      retry: vi.fn(),
      updateTask: vi.fn(() => null),
      getTask: vi.fn(() => null),
      getRunningWorkflows: vi.fn(() => []),
      getWorkflows: vi.fn(() => []),
      getRunningWorkflowIds: vi.fn(() => []),
      decide: vi.fn((id) => createWorkflowModel({ workflowId: id })),
      decideWithLock: vi.fn(() => null),
      terminateWorkflow: vi.fn(),
      terminateWorkflowWithFailure: vi.fn(() => createWorkflowModel()),
      pauseWorkflow: vi.fn(),
      resumeWorkflow: vi.fn(),
      skipTaskFromWorkflow: vi.fn(),
      getWorkflow: vi.fn((id) => createWorkflowModel({ workflowId: id })),
      scheduleNextIteration: vi.fn(),
      startWorkflow: vi.fn(() => ''),
      startWorkflowIdempotent: vi.fn(() => createWorkflowModel()),
    };

    executionDAO = {
      getWorkflowModel: vi.fn(() => null),
      getTaskModel: vi.fn(() => null),
      createWorkflow: vi.fn(),
      updateWorkflow: vi.fn(),
      updateTask: vi.fn(),
      updateTasks: vi.fn(),
      createTasks: vi.fn(),
      removeTask: vi.fn(),
      removeWorkflow: vi.fn(),
      resetWorkflow: vi.fn(),
      populateTaskData: vi.fn(),
      populateWorkflowAndTaskPayloadData: vi.fn(),
      addTaskExecLog: vi.fn(),
      extendLease: vi.fn(),
      removeFromPendingWorkflow: vi.fn(),
      getTaskPollDataByDomain: vi.fn(() => null),
      getPendingWorkflowsByName: vi.fn(() => []),
      getWorkflowsByName: vi.fn(() => []),
      getRunningWorkflowIds: vi.fn(() => []),
      getWorkflowModelFromExecutionDAO: vi.fn(() => createWorkflowModel()),
    };

    properties = {
      activeWorkerLastPollTimeout: 10000,
      workflowOffsetTimeout: 30,
      lockLeaseTime: 60000,
      humanTaskPreventsDeciderQueue: false,
      maxPostponeDurationSeconds: 3600,
      systemTaskPostponeThreshold: 0,
    };

    systemTaskRegistry = new SystemTaskRegistry([]);

    executionLockService = {
      acquireLock: vi.fn(() => true),
      acquireLockWithLease: vi.fn(() => true),
      releaseLock: vi.fn(),
      deleteLock: vi.fn(),
    };

    sweeper = new WorkflowSweeper({
      queueDAO,
      workflowExecutor,
      executionDAO,
      properties,
      sweeperProperties: { sweepBatchSize: 2, queuePopTimeout: 100 },
      systemTaskRegistry,
      executionLockService,
    });
  });

  it('sweep does not repush terminal tasks', async () => {
    const completedTask = createTaskModel({
      taskId: 'completed-task',
      taskType: 'SIMPLE',
      status: 'COMPLETED',
      referenceTaskName: 'completed-task',
    });
    const runningWaitTask = createTaskModel({
      taskId: 'wait-task',
      taskType: 'WAIT',
      status: 'IN_PROGRESS',
      referenceTaskName: 'wait-task',
      waitTimeout: Date.now() + 60000,
    });

    const workflow = createWorkflowModel({
      workflowId: WORKFLOW_ID,
      status: 'RUNNING',
      tasks: [completedTask, runningWaitTask],
    });

    vi.spyOn(workflowExecutor, 'getWorkflow').mockReturnValue(workflow);
    vi.spyOn(workflowExecutor, 'decide').mockReturnValue(workflow);
    vi.spyOn(queueDAO, 'containsMessage').mockReturnValue(true);

    await sweeper.sweep(WORKFLOW_ID);

    expect(queueDAO.push).not.toHaveBeenCalledWith('SIMPLE', 'completed-task', expect.any(Number), expect.any(Number));
    expect(executionLockService.releaseLock).toHaveBeenCalledWith(WORKFLOW_ID);
  });

  it('sweep does not repush non-repairable in-progress simple task', async () => {
    const simpleInProgressTask = createTaskModel({
      taskId: 'simple-task',
      taskType: 'SIMPLE',
      status: 'IN_PROGRESS',
      referenceTaskName: 'simple-task',
    });
    const workflow = createWorkflowModel({
      workflowId: WORKFLOW_ID,
      status: 'RUNNING',
      tasks: [simpleInProgressTask],
    });

    vi.spyOn(workflowExecutor, 'getWorkflow').mockReturnValue(workflow);
    vi.spyOn(workflowExecutor, 'decide').mockReturnValue(workflow);

    await sweeper.sweep(WORKFLOW_ID);

    expect(queueDAO.push).not.toHaveBeenCalledWith('SIMPLE', 'simple-task', expect.any(Number), expect.any(Number));
    expect(executionLockService.releaseLock).toHaveBeenCalledWith(WORKFLOW_ID);
  });

  it('sweep repushes repairable scheduled task when message missing', async () => {
    const scheduledTask = createTaskModel({
      taskId: 'scheduled-task',
      taskType: 'SIMPLE',
      status: 'SCHEDULED',
      referenceTaskName: 'scheduled-task',
      callbackAfterSeconds: 7,
    });
    const workflow = createWorkflowModel({
      workflowId: WORKFLOW_ID,
      status: 'RUNNING',
      tasks: [scheduledTask],
    });

    vi.spyOn(workflowExecutor, 'getWorkflow').mockReturnValue(workflow);
    vi.spyOn(workflowExecutor, 'decide').mockReturnValue(workflow);
    vi.spyOn(queueDAO, 'containsMessage').mockReturnValue(false);

    await sweeper.sweep(WORKFLOW_ID);

    expect(queueDAO.push).toHaveBeenCalledWith('SIMPLE', 'scheduled-task', 0, 7);
    expect(executionLockService.releaseLock).toHaveBeenCalledWith(WORKFLOW_ID);
  });

  it('sweep repairs subworkflow task when subworkflow is terminal', async () => {
    const subWorkflowTask = createTaskModel({
      taskId: 'sub-workflow-task',
      taskType: 'SUB_WORKFLOW',
      status: 'IN_PROGRESS',
      referenceTaskName: 'sub-workflow-task',
      subWorkflowId: 'sub-workflow-id',
    });
    const workflow = createWorkflowModel({
      workflowId: WORKFLOW_ID,
      status: 'RUNNING',
      tasks: [subWorkflowTask],
    });

    class SubWorkflowMockTask extends WorkflowSystemTask {
      constructor() { super('SUB_WORKFLOW'); }
      override isAsync() { return true; }
      override isAsyncComplete(task: TaskModel) { return true; }
    }

    const mockRegistry = new SystemTaskRegistry([new SubWorkflowMockTask()]);
    sweeper = new WorkflowSweeper({
      queueDAO,
      workflowExecutor,
      executionDAO,
      properties,
      sweeperProperties: { sweepBatchSize: 2, queuePopTimeout: 100 },
      systemTaskRegistry: mockRegistry,
      executionLockService,
    });

    const subWorkflow = createWorkflowModel({
      workflowId: 'sub-workflow-id',
      status: 'COMPLETED',
      output: { result: 'ok' },
    });
    const terminalWorkflow = createWorkflowModel({
      workflowId: WORKFLOW_ID,
      status: 'COMPLETED',
    });

    vi.spyOn(workflowExecutor, 'getWorkflow').mockReturnValue(workflow);
    vi.spyOn(workflowExecutor, 'decide')
      .mockReturnValueOnce(workflow)
      .mockReturnValueOnce(terminalWorkflow);
    vi.spyOn(executionDAO, 'getWorkflowModel').mockReturnValue(subWorkflow);

    await sweeper.sweep(WORKFLOW_ID);

    expect(executionDAO.updateTask).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'sub-workflow-task',
      status: 'COMPLETED',
      outputData: { result: 'ok' },
    }));
    expect(workflowExecutor.decide).toHaveBeenCalledTimes(2);
    expect(executionLockService.releaseLock).toHaveBeenCalledWith(WORKFLOW_ID);
  });

  it('sweep ensures parent workflow exists in decider queue if parent workflow present', async () => {
    const simpleTask = createTaskModel({
      taskId: 'task1',
      taskType: 'SIMPLE',
      status: 'IN_PROGRESS',
      referenceTaskName: 'task1',
    });
    const workflow = createWorkflowModel({
      workflowId: WORKFLOW_ID,
      status: 'RUNNING',
      tasks: [simpleTask],
      parentWorkflowId: 'parent-workflow-id',
    });

    vi.spyOn(workflowExecutor, 'getWorkflow').mockReturnValue(workflow);
    vi.spyOn(workflowExecutor, 'decide').mockReturnValue(workflow);
    vi.spyOn(queueDAO, 'containsMessage').mockReturnValue(false);

    await sweeper.sweep(WORKFLOW_ID);

    expect(queueDAO.push).toHaveBeenCalledWith('decider', 'parent-workflow-id', 0, 30);
    expect(executionLockService.releaseLock).toHaveBeenCalledWith(WORKFLOW_ID);
  });
});
