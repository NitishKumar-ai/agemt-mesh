import { BulkResponse } from '@conductor/common';
import type { WorkflowService } from './WorkflowService.js';

export class WorkflowBulkService {
  constructor(private readonly workflowService: WorkflowService) {}

  async pauseWorkflow(workflowIds: string[]): Promise<BulkResponse<string>> {
    const response = new BulkResponse<string>();
    for (const wfId of workflowIds) {
      try {
        await this.workflowService.pauseWorkflow(wfId);
        response.appendSuccessResponse(wfId);
      } catch (e) {
        response.appendFailedResponse(wfId, (e as Error).message);
      }
    }
    return response;
  }

  async resumeWorkflow(workflowIds: string[]): Promise<BulkResponse<string>> {
    const response = new BulkResponse<string>();
    for (const wfId of workflowIds) {
      try {
        await this.workflowService.resumeWorkflow(wfId);
        response.appendSuccessResponse(wfId);
      } catch (e) {
        response.appendFailedResponse(wfId, (e as Error).message);
      }
    }
    return response;
  }

  async terminate(workflowIds: string[], reason?: string): Promise<BulkResponse<string>> {
    const response = new BulkResponse<string>();
    for (const wfId of workflowIds) {
      try {
        await this.workflowService.terminateWorkflow(wfId, reason);
        response.appendSuccessResponse(wfId);
      } catch (e) {
        response.appendFailedResponse(wfId, (e as Error).message);
      }
    }
    return response;
  }

  async deleteWorkflow(workflowIds: string[], archiveWorkflow = true): Promise<BulkResponse<string>> {
    const response = new BulkResponse<string>();
    for (const wfId of workflowIds) {
      try {
        await this.workflowService.deleteWorkflow(wfId, archiveWorkflow);
        response.appendSuccessResponse(wfId);
      } catch (e) {
        response.appendFailedResponse(wfId, (e as Error).message);
      }
    }
    return response;
  }

  async restart(workflowIds: string[], useLatestDefinitions = false): Promise<BulkResponse<string>> {
    const response = new BulkResponse<string>();
    for (const wfId of workflowIds) {
      try {
        await this.workflowService.restartWorkflow(wfId, useLatestDefinitions);
        response.appendSuccessResponse(wfId);
      } catch (e) {
        response.appendFailedResponse(wfId, (e as Error).message);
      }
    }
    return response;
  }

  async retry(workflowIds: string[], resumeSubworkflowTasks = false): Promise<BulkResponse<string>> {
    const response = new BulkResponse<string>();
    for (const wfId of workflowIds) {
      try {
        await this.workflowService.retryWorkflow(wfId, resumeSubworkflowTasks);
        response.appendSuccessResponse(wfId);
      } catch (e) {
        response.appendFailedResponse(wfId, (e as Error).message);
      }
    }
    return response;
  }
}
