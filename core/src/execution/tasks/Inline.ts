import { WorkflowSystemTask } from '../WorkflowSystemTask.js';
import type { WorkflowModel, TaskModel } from '../types.js';
import type { WorkflowExecutor } from '../WorkflowExecutor.js';
import { TaskType } from '@agentmesh/common';

const QUERY_EVALUATOR_TYPE = 'evaluatorType';
const QUERY_EXPRESSION_PARAMETER = 'expression';

export class Inline extends WorkflowSystemTask {
  private evaluators: Map<string, (expression: string, input: Record<string, unknown>) => unknown>;

  constructor() {
    super(TaskType.INLINE);
    this.evaluators = new Map();
    this.evaluators.set('javascript', this.jsEval.bind(this));
    this.evaluators.set('graaljs', this.jsEval.bind(this));
  }

  override execute(
    workflow: WorkflowModel,
    task: TaskModel,
    workflowExecutor: WorkflowExecutor,
  ): boolean {
    const taskInput = task.inputData;
    let evaluatorType = taskInput[QUERY_EVALUATOR_TYPE] as string | undefined;
    if (!evaluatorType) {
      evaluatorType = 'javascript';
    }
    const expression = taskInput[QUERY_EXPRESSION_PARAMETER] as string | undefined;

    try {
      this.checkEvaluatorType(evaluatorType);
      this.checkExpression(expression);

      const evaluator = this.evaluators.get(evaluatorType)!;
      const evalResult = evaluator(expression!, taskInput);
      task.outputData['result'] = evalResult;
      task.status = 'COMPLETED';
    } catch (e) {
      const errorMessage = (e as Error).cause
        ? ((e as Error).cause as Error).message
        : (e as Error).message;
      task.status =
        (e as Error).name === 'TerminateWorkflowError'
          ? ('FAILED_WITH_TERMINAL_ERROR')
          : ('FAILED');
      task.reasonForIncompletion = errorMessage;
      task.outputData['error'] = errorMessage;
    }

    return true;
  }

  private checkEvaluatorType(evaluatorType: string): void {
    if (!evaluatorType || evaluatorType.trim().length === 0) {
      throw new TerminateWorkflowError(
        `Empty '${QUERY_EVALUATOR_TYPE}' in INLINE task's input parameters.`,
      );
    }
    if (!this.evaluators.has(evaluatorType)) {
      throw new TerminateWorkflowError(
        `Unknown evaluator '${evaluatorType}' in INLINE task.`,
      );
    }
  }

  private checkExpression(expression: string | undefined): void {
    if (!expression || expression.trim().length === 0) {
      throw new TerminateWorkflowError(
        `Empty '${QUERY_EXPRESSION_PARAMETER}' in Inline task's input parameters.`,
      );
    }
  }

  private jsEval(expression: string, input: Record<string, unknown>): unknown {
    const keys = Object.keys(input);
    const vals = Object.values(input);
    try {
      const fn = new Function(...keys, `"use strict"; return (${expression});`);
      return fn(...vals);
    } catch (e) {
      throw new TerminateWorkflowError(`Script evaluation failed: ${(e as Error).message}`);
    }
  }
}

class TerminateWorkflowError extends Error {
  override name = 'TerminateWorkflowError';
}
