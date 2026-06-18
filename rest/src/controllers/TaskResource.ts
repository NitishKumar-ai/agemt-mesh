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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TaskService } from '../services/TaskService.js';

@ApiTags('tasks')
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
    return await this.taskService.batchPoll(taskType, workerId, domain, c, t);
  }

  @Get('in_progress/:taskType')
  async getTasksInProgress(
    @Param('taskType') taskType: string,
    @Query('startKey') startKey: string,
    @Query('count') count: string,
  ): Promise<any[]> {
    const c = count ? parseInt(count, 10) : 100;
    return await this.taskService.getTasksInProgress(taskType, startKey, c);
  }

  @Get('in_progress/workflow/:workflowId')
  async getPendingTasksForWorkflow(@Param('workflowId') workflowId: string): Promise<any[]> {
    return await this.taskService.getPendingTasksForWorkflow(workflowId);
  }

  @Post()
  async updateTask(@Body() body: any): Promise<string> {
    try {
      return await this.taskService.updateTask(body);
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
    return await this.taskService.getQueueAll();
  }

  @Get('queue/all/verbose')
  async getQueueAllVerbose(): Promise<any> {
    return await this.taskService.getQueueAllVerbose();
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
    await this.taskService.removeTaskFromQueue(taskType, taskId);
  }
}
