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
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { WorkflowModel } from '@agentmesh/common';
import { NotFoundException, ConflictException } from '@agentmesh/common';
import { WorkflowService } from '../services/WorkflowService.js';
import { OidcAuthGuard } from '../OidcAuthGuard.js';

@ApiTags('workflows')
@UseGuards(OidcAuthGuard)
@Controller('api/workflow')
export class WorkflowResource {
  constructor(private readonly workflowService: WorkflowService) {}

  private mapWorkflowError(err: Error): never {
    // Typed errors (thrown by WorkflowExecutorOps and the newer WorkflowService
    // paths) map by class, not by message wording — durable across message
    // changes. Substring matching below is a fallback only for the DAO-fallback
    // paths that still throw plain Error and haven't been migrated yet.
    if (err instanceof NotFoundException) {
      throw new HttpException(err.message, HttpStatus.NOT_FOUND);
    }
    if (err instanceof ConflictException) {
      throw new HttpException(err.message, HttpStatus.CONFLICT);
    }

    const msg = err.message;
    if (msg.toLowerCase().includes('not found')) {
      throw new HttpException(msg, HttpStatus.NOT_FOUND);
    }
    if (
      msg.toLowerCase().includes('already') ||
      msg.toLowerCase().includes('still') ||
      msg.toLowerCase().includes('terminal') ||
      msg.toLowerCase().includes('not in') ||
      msg.toLowerCase().includes('cannot terminate') ||
      msg.toLowerCase().includes('unable to') ||
      msg.toLowerCase().includes('not started')
    ) {
      throw new HttpException(msg, HttpStatus.CONFLICT);
    }
    throw new HttpException(msg, HttpStatus.BAD_REQUEST);
  }

  @Post()
  async startWorkflow(@Body() body: any): Promise<string> {
    try {
      const workflowId = await this.workflowService.startWorkflow(body);
      return workflowId;
    } catch (err) {
      this.mapWorkflowError(err as Error);
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
      const workflowId = await this.workflowService.startWorkflow({
        name,
        version,
        input: body ?? {},
        correlationId: requestId,
      });
      return await this.workflowService.getWorkflow(workflowId);
    } catch (err) {
      this.mapWorkflowError(err as Error);
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
      this.mapWorkflowError(err as Error);
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
      this.mapWorkflowError(err as Error);
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
      this.mapWorkflowError(err as Error);
    }
  }

  @Put(':workflowId/pause')
  async pauseWorkflow(@Param('workflowId') workflowId: string): Promise<void> {
    try {
      await this.workflowService.pauseWorkflow(workflowId);
    } catch (err) {
      this.mapWorkflowError(err as Error);
    }
  }

  @Put(':workflowId/resume')
  async resumeWorkflow(@Param('workflowId') workflowId: string): Promise<void> {
    try {
      await this.workflowService.resumeWorkflow(workflowId);
    } catch (err) {
      this.mapWorkflowError(err as Error);
    }
  }

  @Post(':workflowId/rerun')
  async rerunWorkflow(@Param('workflowId') workflowId: string, @Body() body: any): Promise<string> {
    try {
      return await this.workflowService.rerunWorkflow(workflowId, body);
    } catch (err) {
      this.mapWorkflowError(err as Error);
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
      this.mapWorkflowError(err as Error);
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
      this.mapWorkflowError(err as Error);
    }
  }

  @Post(':workflowId/resetcallbacks')
  async resetCallbacks(@Param('workflowId') workflowId: string): Promise<void> {
    try {
      await this.workflowService.resetWorkflow(workflowId);
    } catch (err) {
      this.mapWorkflowError(err as Error);
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
      this.mapWorkflowError(err as Error);
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
      this.mapWorkflowError(err as Error);
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
      this.mapWorkflowError(err as Error);
    }
  }
}
