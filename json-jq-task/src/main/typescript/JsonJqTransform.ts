import { WorkflowSystemTask, TaskModel, WorkflowModel, WorkflowExecutor } from '@conductor/core';

export class JsonJqTransform extends WorkflowSystemTask {
  static readonly NAME = 'JSON_JQ_TRANSFORM';
  private static readonly QUERY_EXPRESSION_PARAMETER = 'queryExpression';
  private static readonly OUTPUT_RESULT = 'result';
  private static readonly OUTPUT_RESULT_LIST = 'resultList';
  private static readonly OUTPUT_ERROR = 'error';
  
  constructor() {
    super(JsonJqTransform.NAME);
  }

  override async start(workflow: WorkflowModel, task: TaskModel, executor: WorkflowExecutor): Promise<void> {
    const taskInput = task.inputData || {};
    const queryExpression = taskInput[JsonJqTransform.QUERY_EXPRESSION_PARAMETER] as string | undefined;

    if (!queryExpression) {
      task.reasonForIncompletion = `Missing '${JsonJqTransform.QUERY_EXPRESSION_PARAMETER}' in input parameters`;
      task.status = 'FAILED';
      return;
    }

    try {
      const jq = await require('jq-web');
      const inputStr = JSON.stringify(taskInput);
      const resultStr = jq.raw(inputStr, queryExpression, ['-c']);
      
      task.status = 'COMPLETED';
      if (resultStr === undefined || resultStr === null || resultStr === 'null' || resultStr === '') {
        task.outputData = {
          ...task.outputData,
          [JsonJqTransform.OUTPUT_RESULT]: null,
          [JsonJqTransform.OUTPUT_RESULT_LIST]: null
        };
      } else {
        const extractedResults = String(resultStr).split('\n').filter(line => line.trim() !== '').map(line => JSON.parse(line));
        
        task.outputData = {
          ...task.outputData,
          [JsonJqTransform.OUTPUT_RESULT]: extractedResults.length === 0 ? null : extractedResults[0],
          [JsonJqTransform.OUTPUT_RESULT_LIST]: extractedResults
        };
      }
    } catch (e: any) {
      task.status = 'FAILED';
      const message = this.extractFirstValidMessage(e);
      task.reasonForIncompletion = message;
      task.outputData = {
        ...task.outputData,
        [JsonJqTransform.OUTPUT_ERROR]: message
      };
    }
  }

  override execute(workflow: WorkflowModel, task: TaskModel, workflowExecutor: WorkflowExecutor): boolean {
    this.start(workflow, task, workflowExecutor);
    return true;
  }

  private extractFirstValidMessage(e: any): string {
    let currentStack = e;
    const messages: string[] = [];
    if (currentStack?.message) {
      messages.push(currentStack.message);
    }
    while (currentStack?.cause) {
      currentStack = currentStack.cause;
      if (currentStack.message) {
        messages.push(currentStack.message);
      }
    }
    const msg = messages.find(it => !it.includes('N/A'));
    return msg || '';
  }
}
