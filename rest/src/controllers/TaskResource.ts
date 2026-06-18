import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import type { TaskStatus } from '@conductor/common';
import { ApiTags } from '@nestjs/swagger';
import { TaskService } from '../services/TaskService.js';

function asString(body: unknown): string {
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object') {
    if ('log' in (body as Record<string, unknown>)) return String((body as Record<string, unknown>).log);
  }
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

@ApiTags('tasks')
@Controller('api/tasks')
export class TaskResource {
  constructor(private readonly taskService: TaskService) {}

  @Get('poll/batch/:tasktype')
  async pollBatch(
    @Param('tasktype') tasktype: string,
    @Query('count') countStr: string,
    @Query('timeout') timeoutStr: string,
  ): Promise<any> {
    const count = countStr ? Number(countStr) : 1;
    const timeout = timeoutStr ? Number(timeoutStr) : 100;
    return await this.taskService.pollBatch(tasktype, count, timeout);
  }

  @Get('poll/:tasktype')
  async poll(
    @Param('tasktype') tasktype: string,
    @Query('workerid') workerId: string,
    @Query('domain') domain: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<any> {
    const task = await this.taskService.poll(tasktype, workerId, domain);
    if (!task) {
      res.status(204);
      return;
    }
    return task;
  }

  @Get('queue/sizes')
  async getTaskQueueSizes(@Query('taskType') taskType: string | string[]): Promise<any> {
    const types = taskType ? (Array.isArray(taskType) ? taskType : [taskType]) : [];
    return await this.taskService.getTaskQueueSizes(types);
  }

  @Get('queue/size')
  async getTaskQueueSize(@Query('taskType') taskType: string): Promise<any> {
    return await this.taskService.getTaskQueueSize(taskType);
  }

  @Get('queue/all/verbose')
  async allVerbose(): Promise<any> {
    return await this.taskService.allVerbose();
  }

  @Get('queue/all')
  async getAllQueueDetails(): Promise<any> {
    return await this.taskService.getAllQueueDetails();
  }

  @Get('queue/polldata/all')
  async getAllPollData(): Promise<any> {
    return await this.taskService.getAllPollData();
  }

  @Get('queue/polldata')
  async getPollData(@Query('taskType') taskType: string): Promise<any> {
    return await this.taskService.getPollData(taskType);
  }

  @Post('queue/requeue/:taskType')
  async requeuePendingTask(
    @Param('taskType') taskType: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.taskService.requeuePendingTask(taskType);
    res.type('text/plain').send(result);
  }

  @Get('search')
  async search(
    @Query('start') startStr: string,
    @Query('size') sizeStr: string,
    @Query('sort') sort: string,
    @Query('freeText') freeText: string,
    @Query('query') query: string,
  ): Promise<any> {
    const start = startStr ? Number(startStr) : 0;
    const size = sizeStr ? Number(sizeStr) : 100;
    return await this.taskService.search(start, size, sort, freeText, query);
  }

  @Get('search-v2')
  async searchV2(
    @Query('start') startStr: string,
    @Query('size') sizeStr: string,
    @Query('sort') sort: string,
    @Query('freeText') freeText: string,
    @Query('query') query: string,
  ): Promise<any> {
    const start = startStr ? Number(startStr) : 0;
    const size = sizeStr ? Number(sizeStr) : 100;
    return await this.taskService.searchV2(start, size, sort, freeText, query);
  }

  @Get('externalstoragelocation')
  async getExternalStorageLocation1(
    @Query('path') path: string,
    @Query('operation') operation: string,
    @Query('payloadType') payloadType: string,
  ): Promise<any> {
    return await this.taskService.getExternalStorageLocation(path, operation, payloadType);
  }

  @Get('external-storage-location')
  async getExternalStorageLocation2(
    @Query('path') path: string,
    @Query('operation') operation: string,
    @Query('payloadType') payloadType: string,
  ): Promise<any> {
    return await this.taskService.getExternalStorageLocation(path, operation, payloadType);
  }

  @Post('update-v2')
  async updateTaskV2(
    @Body() body: any,
    @Res({ passthrough: true }) res: Response,
  ): Promise<any> {
    try {
      const task = await this.taskService.updateTaskV2(body);
      if (!task) {
        res.status(204);
        return;
      }
      return task;
    } catch (err) {
      throw new HttpException((err as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post(':workflowId/:taskRefName/:status/sync')
  async updateTaskSync(
    @Param('workflowId') workflowId: string,
    @Param('taskRefName') taskRefName: string,
    @Param('status') status: TaskStatus,
    @Query('workerid') workerId: string,
    @Body() body: any,
  ): Promise<any> {
    try {
      const pending = await this.taskService.getPendingTaskForWorkflow(workflowId, taskRefName);
      if (!pending) {
        throw new HttpException(`No running task ${taskRefName} for workflow ${workflowId}`, HttpStatus.NOT_FOUND);
      }

      await this.taskService.updateTask(pending.taskId!, {
        workflowInstanceId: pending.workflowInstanceId!,
        status,
        outputData: body,
        workerId,
      });

      return await this.taskService.getWorkflowForTask(pending.taskId!);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException((err as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post(':workflowId/:taskRefName/:status')
  async updateTaskStatus(
    @Param('workflowId') workflowId: string,
    @Param('taskRefName') taskRefName: string,
    @Param('status') status: TaskStatus,
    @Query('workerid') workerId: string,
    @Body() body: any,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const tasks = await this.taskService.getTasksByRefName(workflowId, taskRefName);
      if (tasks.length === 0) {
        res.status(HttpStatus.NOT_FOUND).json({ error: `Task ${taskRefName} not found in workflow ${workflowId}` });
        return;
      }
      const task = tasks[0]!;
      if (!task.taskId) {
        res.status(HttpStatus.BAD_REQUEST).json({ error: 'Task has no taskId' });
        return;
      }
      await this.taskService.updateTask(task.taskId, {
        workflowInstanceId: task.taskId,
        status,
        outputData: body,
        workerId: workerId ? String(workerId) : undefined,
      });
      res.status(HttpStatus.OK).send(task.taskId);
    } catch (err) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: (err as Error).message });
    }
  }

  @Post(':taskId/log')
  async logTask(
    @Param('taskId') taskId: string,
    @Body() body: any,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const logMessage = asString(body);
      await this.taskService.log(taskId, logMessage);
      res.status(HttpStatus.OK).send();
    } catch (err) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: (err as Error).message });
    }
  }

  @Get(':taskId/log')
  async getTaskLogs(
    @Param('taskId') taskId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<any> {
    const logs = await this.taskService.getTaskLogs(taskId);
    if (logs.length === 0) {
      res.status(204);
      return;
    }
    return logs;
  }

  @Get(':taskId')
  async getTask(
    @Param('taskId') taskId: string,
  ): Promise<any> {
    const task = await this.taskService.getTask(taskId);
    if (!task) {
      throw new HttpException(`Task ${taskId} not found`, HttpStatus.NOT_FOUND);
    }
    return task;
  }

  @Post()
  async updateTask(
    @Body() body: any,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const taskId = body.taskId || body.workflowInstanceId;
      await this.taskService.updateTask(taskId, body);
      res.status(HttpStatus.OK).send(taskId);
    } catch (err) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: (err as Error).message });
    }
  }
}
