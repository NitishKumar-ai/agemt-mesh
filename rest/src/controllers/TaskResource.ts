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
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TaskService } from '../services/TaskService.js';
import { OidcAuthGuard } from '../OidcAuthGuard.js';

@ApiTags('tasks')
@UseGuards(OidcAuthGuard)
@Controller('api/tasks')
export class TaskResource {
  constructor(private readonly taskService: TaskService) {}

  @Get('poll/:taskType')
  async poll(
    @Param('taskType') taskType: string,
    @Query('workerId') workerId: string,
    @Query('domain') domain: string,
  ): Promise<any> {
    return await this.taskService.poll(taskType, workerId, domain);
  }

  @Get('poll/batch/:taskType')
  async batchPoll(
    @Param('taskType') taskType: string,
    @Query('workerId') workerId: string,
    @Query('domain') domain: string,
    @Query('count') count: string,
    @Query('timeout') timeout: string,
  ): Promise<any[]> {
    const c = count ? parseInt(count, 10) : 1;
    const t = timeout ? parseInt(timeout, 10) : 100;
    return await this.taskService.pollBatch(taskType, c, t);
  }

  @Get('in_progress/:taskType')
  async getTasksInProgress(
    @Param('taskType') taskType: string,
    @Query('startKey') startKey: string,
    @Query('count') count: string,
  ): Promise<any[]> {
    return [];
  }

  @Get('in_progress/workflow/:workflowId')
  async getPendingTasksForWorkflow(@Param('workflowId') workflowId: string): Promise<any[]> {
    return [];
  }

  @Post()
  async updateTask(@Body() body: any): Promise<any> {
    try {
      return await this.taskService.updateTaskV2(body);
    } catch (err) {
      throw new HttpException((err as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post(':taskId/log')
  async log(@Param('taskId') taskId: string, @Body() body: string): Promise<void> {
    await this.taskService.log(taskId, body);
  }

  @Get(':taskId/log')
  async getTaskLogs(@Param('taskId') taskId: string): Promise<any[]> {
    return await this.taskService.getTaskLogs(taskId);
  }

  @Get(':taskId')
  async getTask(@Param('taskId') taskId: string): Promise<any> {
    const task = await this.taskService.getTask(taskId);
    if (!task) {
      throw new HttpException(`Task ${taskId} not found`, HttpStatus.NOT_FOUND);
    }
    return task;
  }

  @Post('queue/requeue/:taskType')
  async requeuePendingTask(@Param('taskType') taskType: string): Promise<any> {
    return await this.taskService.requeuePendingTask(taskType);
  }

  @Get('queue/all')
  async getQueueAll(): Promise<any> {
    return await this.taskService.getAllQueueDetails();
  }

  @Get('queue/all/verbose')
  async getQueueAllVerbose(): Promise<any> {
    return await this.taskService.allVerbose();
  }

  @Get('queue/size')
  async getQueueSize(@Query('taskType') taskType: string): Promise<any> {
    return await this.taskService.getQueueSize(taskType);
  }

  @Delete('queue/:taskType/:taskId')
  async removeTaskFromQueue(
    @Param('taskType') taskType: string,
    @Param('taskId') taskId: string,
  ): Promise<void> {
    // Service missing this
  }
}
