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
import { MetadataService } from '../services/MetadataService.js';

@ApiTags('metadata')
@Controller('api/metadata')
export class MetadataResource {
  constructor(private readonly metadataService: MetadataService) {}

  @Post('workflow')
  async registerWorkflowDef(@Body() body: any): Promise<void> {
    try {
      await this.metadataService.registerWorkflowDef(body);
    } catch (err) {
      throw new HttpException((err as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  @Put('workflow')
  async updateWorkflowDef(@Body() body: any[]): Promise<void> {
    try {
      await this.metadataService.updateWorkflowDefs(body);
    } catch (err) {
      throw new HttpException((err as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  @Get('workflow/:name')
  async getWorkflowDef(
    @Param('name') name: string,
    @Query('version') version: string,
  ): Promise<any> {
    const v = version ? Number(version) : undefined;
    const def = await this.metadataService.getWorkflowDef(name, v);
    if (!def) {
      throw new HttpException(`Workflow definition ${name} not found`, HttpStatus.NOT_FOUND);
    }
    return def;
  }

  @Get('workflow')
  async getAllWorkflowDefs(): Promise<any[]> {
    return await this.metadataService.getWorkflowDefs();
  }

  @Delete('workflow/:name/:version')
  async unregisterWorkflowDef(
    @Param('name') name: string,
    @Param('version') version: string,
  ): Promise<void> {
    await this.metadataService.removeWorkflowDef(name, Number(version));
  }

  @Post('taskdefs')
  async registerTaskDef(@Body() body: any[]): Promise<void> {
    await this.metadataService.registerTaskDefs(body);
  }

  @Put('taskdefs')
  async updateTaskDef(@Body() body: any): Promise<void> {
    await this.metadataService.updateTaskDef(body);
  }

  @Get('taskdefs/:name')
  async getTaskDef(@Param('name') name: string): Promise<any> {
    const def = await this.metadataService.getTaskDef(name);
    if (!def) {
      throw new HttpException(`Task definition ${name} not found`, HttpStatus.NOT_FOUND);
    }
    return def;
  }

  @Get('taskdefs')
  async getAllTaskDefs(): Promise<any[]> {
    return await this.metadataService.getTaskDefs();
  }

  @Delete('taskdefs/:name')
  async unregisterTaskDef(@Param('name') name: string): Promise<void> {
    await this.metadataService.removeTaskDef(name);
  }
}
