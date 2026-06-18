import {
  Controller,
  Post,
  Put,
  Delete,
  Body,
  Query,
} from '@nestjs/common';
import { WorkflowBulkService } from '../services/WorkflowBulkService.js';

@Controller('api/workflow/bulk')
export class WorkflowBulkResource {
  constructor(private readonly bulkService: WorkflowBulkService) {}

  @Put('pause')
  async pauseWorkflow(@Body() body: any): Promise<any> {
    return await this.bulkService.pauseWorkflow(body);
  }

  @Put('resume')
  async resumeWorkflow(@Body() body: any): Promise<any> {
    return await this.bulkService.resumeWorkflow(body);
  }

  @Post('terminate')
  async terminate(
    @Body() body: any,
    @Query('reason') reason: string,
  ): Promise<any> {
    return await this.bulkService.terminate(body, reason);
  }

  @Delete('remove')
  async deleteWorkflow(
    @Body() body: any,
    @Query('archiveWorkflow') archiveStr: string,
  ): Promise<any> {
    const archiveWorkflow = archiveStr !== 'false';
    return await this.bulkService.deleteWorkflow(body, archiveWorkflow);
  }

  @Post('restart')
  async restart(
    @Body() body: any,
    @Query('useLatestDefinitions') useLatestStr: string,
  ): Promise<any> {
    const useLatest = useLatestStr === 'true';
    return await this.bulkService.restart(body, useLatest);
  }

  @Post('retry')
  async retry(
    @Body() body: any,
    @Query('resumeSubworkflowTasks') resumeSubStr: string,
  ): Promise<any> {
    const resumeSub = resumeSubStr === 'true';
    return await this.bulkService.retry(body, resumeSub);
  }
}
