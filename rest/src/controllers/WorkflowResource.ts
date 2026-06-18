import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { WorkflowModel } from '@conductor/common';
import { WorkflowService } from '../services/WorkflowService.js';

@ApiTags('workflows')
@Controller('api/workflow')
export class WorkflowResource {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post()
  async startWorkflow(@Body() body: any): Promise<string> {
    try {
      const workflowId = await this.workflowService.startWorkflow(body);
      return workflowId;
    } catch (err) {
      throw new HttpException((err as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('execute/:name/:version')
  async executeWorkflow(
    @Param('name') name: string,
    @Param('version', ParseIntPipe) version: number,
    @Query('requestId') requestId?: string,
    @Query('waitUntilTaskRef') _waitUntilTaskRef?: string,
    @Body() body?: Record<string, unknown>,
  ): Promise<any> {
    try {
      const workflowId = await this.workflowService.startWorkflow({ name, version, input: body ?? {}, correlationId: requestId });
      return await this.workflowService.getWorkflow(workflowId);
    } catch (err) {
      throw new HttpException((err as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post(':name')
  async startWorkflowByName(
    @Param('name') name: string,
    @Query('version') version: string,
    @Query('correlationId') correlationId: string,
    @Body() body: any,
  ): Promise<string> {
    try {
      const workflowId = await this.workflowService.startWorkflow({
        name,
        version: version ? Number(version) : undefined,
        correlationId,
        input: body,
      });
      return workflowId;
    } catch (err) {
      throw new HttpException((err as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  @Get('search')
  async searchWorkflows(): Promise<any> {
    return await this.workflowService.searchWorkflows(0, 100);
  }

  @Get(':workflowId/tasks')
  async getWorkflowTasks(
    @Param('workflowId') workflowId: string,
    @Query('start') start: string,
    @Query('count') count: string,
    @Query('status') statusStr: string,
  ): Promise<any> {
    try {
      const s = start ? parseInt(start, 10) : 0;
      const c = count ? parseInt(count, 10) : 15;
      const status = statusStr ? statusStr.split(',').map((s) => s.trim()) : undefined;
      return await this.workflowService.getWorkflowTasks(workflowId, s, c, status);
    } catch (err) {
      throw new HttpException((err as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  @Get(':workflowId')
  async getWorkflow(
    @Param('workflowId') workflowId: string,
    @Query('includeTasks') includeTasksStr: string,
  ): Promise<any> {
    const includeTasks = includeTasksStr !== 'false';
    const workflow = await this.workflowService.getWorkflow(workflowId, includeTasks);
    if (!workflow) {
      throw new HttpException(`Workflow ${workflowId} not found`, HttpStatus.NOT_FOUND);
    }
    return workflow;
  }

  @Get('running/:name')
  async getRunningWorkflowIds(
    @Param('name') name: string,
    @Query('version') version: string,
  ): Promise<string[]> {
    const v = version ? Number(version) : undefined;
    return await this.workflowService.getRunningWorkflowIds(name, v);
  }

  @Put(':workflowId/decide')
  async decideWorkflow(@Param('workflowId') workflowId: string): Promise<void> {
    try {
      await this.workflowService.decideWorkflow(workflowId);
    } catch (err) {
      throw new HttpException((err as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  @Put(':workflowId/pause')
  async pauseWorkflow(@Param('workflowId') workflowId: string): Promise<void> {
    try {
      await this.workflowService.pauseWorkflow(workflowId);
    } catch (err) {
      throw new HttpException((err as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  @Put(':workflowId/resume')
  async resumeWorkflow(@Param('workflowId') workflowId: string): Promise<void> {
    try {
      await this.workflowService.resumeWorkflow(workflowId);
    } catch (err) {
      throw new HttpException((err as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post(':workflowId/rerun')
  async rerunWorkflow(
    @Param('workflowId') workflowId: string,
    @Body() body: any,
  ): Promise<string> {
    try {
      return await this.workflowService.rerunWorkflow(workflowId, body);
    } catch (err) {
      throw new HttpException((err as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post(':workflowId/restart')
  async restartWorkflow(
    @Param('workflowId') workflowId: string,
    @Query('useLatestDefinitions') useLatestStr: string,
  ): Promise<void> {
    try {
      const useLatest = useLatestStr === 'true';
      await this.workflowService.restartWorkflow(workflowId, useLatest);
    } catch (err) {
      throw new HttpException((err as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post(':workflowId/retry')
  async retryWorkflow(
    @Param('workflowId') workflowId: string,
    @Query('resumeSubworkflowTasks') resumeSubStr: string,
  ): Promise<void> {
    try {
      const resumeSub = resumeSubStr === 'true';
      await this.workflowService.retryWorkflow(workflowId, resumeSub);
    } catch (err) {
      throw new HttpException((err as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post(':workflowId/resetcallbacks')
  async resetCallbacks(@Param('workflowId') workflowId: string): Promise<void> {
    try {
      await this.workflowService.resetWorkflow(workflowId);
    } catch (err) {
      throw new HttpException((err as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  @Delete(':workflowId')
  async terminateWorkflow(
    @Param('workflowId') workflowId: string,
    @Query('reason') reason: string,
  ): Promise<void> {
    try {
      await this.workflowService.terminateWorkflow(workflowId, reason);
    } catch (err) {
      throw new HttpException((err as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  @Delete(':workflowId/remove')
  async deleteWorkflow(
    @Param('workflowId') workflowId: string,
    @Query('archiveWorkflow') archiveStr: string,
  ): Promise<void> {
    try {
      const archiveWorkflow = archiveStr !== 'false';
      await this.workflowService.deleteWorkflow(workflowId, archiveWorkflow);
    } catch (err) {
      throw new HttpException((err as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  @Delete(':workflowId/terminate-remove')
  async terminateRemove(
    @Param('workflowId') workflowId: string,
    @Query('reason') reason: string,
    @Query('archiveWorkflow') archiveStr: string,
  ): Promise<void> {
    try {
      const archiveWorkflow = archiveStr !== 'false';
      await this.workflowService.terminateRemove(workflowId, reason, archiveWorkflow);
    } catch (err) {
      throw new HttpException((err as Error).message, HttpStatus.BAD_REQUEST);
    }
  }
}
