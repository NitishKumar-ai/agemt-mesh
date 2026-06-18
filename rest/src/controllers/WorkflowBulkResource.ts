import { Controller, Post, Body, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WorkflowBulkService } from '../services/WorkflowBulkService.js';

@ApiTags('workflows')
@Controller('api/workflow/bulk')
export class WorkflowBulkResource {
  constructor(private readonly workflowBulkService: WorkflowBulkService) {}

  @Post('pause')
  async pauseWorkflow(@Body() workflowIds: string[]): Promise<any> {
    return await this.workflowBulkService.pauseWorkflow(workflowIds);
  }

  @Post('resume')
  async resumeWorkflow(@Body() workflowIds: string[]): Promise<any> {
    return await this.workflowBulkService.resumeWorkflow(workflowIds);
  }

  @Post('restart')
  async restartWorkflow(
    @Body() workflowIds: string[],
    @Query('useLatestDefinitions') useLatestStr: string,
  ): Promise<any> {
    const useLatest = useLatestStr === 'true';
    return await this.workflowBulkService.restart(workflowIds, useLatest);
  }

  @Post('retry')
  async retryWorkflow(@Body() workflowIds: string[]): Promise<any> {
    return await this.workflowBulkService.retry(workflowIds);
  }

  @Post('terminate')
  async terminateWorkflow(
    @Body() workflowIds: string[],
    @Query('reason') reason: string,
  ): Promise<any> {
    return await this.workflowBulkService.terminate(workflowIds, reason);
  }
}
