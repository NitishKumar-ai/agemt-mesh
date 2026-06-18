import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { AdminService } from '../services/AdminService.js';

@ApiTags('admin')
@Controller('api/admin')
export class AdminResource {
  constructor(private readonly adminService: AdminService) {}

  @Get('config')
  getAllConfig(): any {
    return this.adminService.getAllConfig();
  }

  @Get('task/:tasktype')
  async getListOfPendingTask(
    @Param('tasktype') tasktype: string,
    @Query('start') startStr: string,
    @Query('count') countStr: string,
  ): Promise<any> {
    const start = startStr ? parseInt(startStr, 10) : 0;
    const count = countStr ? parseInt(countStr, 10) : 100;
    return await this.adminService.getListOfPendingTask(tasktype, start, count);
  }

  @Post('sweep/requeue/:workflowId')
  async requeueSweep(
    @Param('workflowId') workflowId: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.adminService.requeueSweep(workflowId);
    res.type('text/plain').send(result);
  }
}
