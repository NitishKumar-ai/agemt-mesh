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
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { WorkflowDefSchema, TaskDefSchema } from '@conductor/common';
import { ApiTags } from '@nestjs/swagger';
import { MetadataService } from '../services/MetadataService.js';

@ApiTags('metadata')
@Controller('api/metadata')
export class MetadataResource {
  constructor(private readonly metadataService: MetadataService) {}

  @Post('workflow/validate')
  async validateWorkflowDef(
    @Body() body: any,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const parsed = WorkflowDefSchema.parse(body);
      await this.metadataService.validateWorkflowDef(parsed);
      res.status(HttpStatus.OK).send();
    } catch (err) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: (err as Error).message });
    }
  }

  @Post('workflow')
  async registerWorkflowDef(
    @Body() body: any,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const parsed = WorkflowDefSchema.parse(body);
      await this.metadataService.registerWorkflowDef(parsed);
      res.status(HttpStatus.CREATED).send();
    } catch (err) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: (err as Error).message });
    }
  }

  @Put('workflow')
  async updateWorkflowDefs(
    @Body() body: any,
  ): Promise<any> {
    try {
      const bodyArray = Array.isArray(body) ? body : [body];
      const defs = bodyArray.map((d: unknown) => WorkflowDefSchema.parse(d));
      return await this.metadataService.updateWorkflowDefs(defs);
    } catch (err) {
      throw new HttpException((err as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  @Get('workflow/names-and-versions')
  async getWorkflowNamesAndVersions(): Promise<any> {
    return await this.metadataService.getWorkflowNamesAndVersions();
  }

  @Get('workflow/names')
  async getWorkflowNames(): Promise<any> {
    return await this.metadataService.getWorkflowNames();
  }

  @Get('workflow/latest-versions')
  async getLatestVersions(): Promise<any> {
    return await this.metadataService.getLatestVersions();
  }

  @Get('workflow/:name/versions')
  async getWorkflowVersions(@Param('name') name: string): Promise<any> {
    return await this.metadataService.getWorkflowVersions(name);
  }

  @Get('workflow/:name')
  async getWorkflowDef(
    @Param('name') name: string,
    @Query('version') versionStr: string,
  ): Promise<any> {
    const version = versionStr ? Number(versionStr) : undefined;
    const def = await this.metadataService.getWorkflowDef(name, version);
    if (!def) {
      throw new HttpException(`WorkflowDef ${name} not found`, HttpStatus.NOT_FOUND);
    }
    return def;
  }

  @Get('workflow')
  async getWorkflowDefs(): Promise<any> {
    return await this.metadataService.getWorkflowDefs();
  }

  @Delete('workflow/:name/:version')
  async removeWorkflowDef(
    @Param('name') name: string,
    @Param('version') versionStr: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.metadataService.removeWorkflowDef(name, Number(versionStr));
      res.status(HttpStatus.NO_CONTENT).send();
    } catch (err) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: (err as Error).message });
    }
  }

  @Post('taskdefs')
  async registerTaskDefs(
    @Body() body: any,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const bodyArray = Array.isArray(body) ? body : [body];
      const defs = bodyArray.map((d: unknown) => TaskDefSchema.parse(d));
      await this.metadataService.registerTaskDefs(defs);
      res.status(HttpStatus.CREATED).send();
    } catch (err) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: (err as Error).message });
    }
  }

  @Put('taskdefs')
  async updateTaskDef(
    @Body() body: any,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const parsed = TaskDefSchema.parse(body);
      await this.metadataService.updateTaskDef(parsed);
      res.status(HttpStatus.NO_CONTENT).send();
    } catch (err) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: (err as Error).message });
    }
  }

  @Get('taskdefs')
  async getTaskDefs(): Promise<any> {
    return await this.metadataService.getTaskDefs();
  }

  @Get('taskdefs/:tasktype')
  async getTaskDef(@Param('tasktype') tasktype: string): Promise<any> {
    const def = await this.metadataService.getTaskDef(tasktype);
    if (!def) {
      throw new HttpException(`TaskDef ${tasktype} not found`, HttpStatus.NOT_FOUND);
    }
    return def;
  }

  @Delete('taskdefs/:tasktype')
  async removeTaskDef(
    @Param('tasktype') tasktype: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.metadataService.removeTaskDef(tasktype);
      res.status(HttpStatus.NO_CONTENT).send();
    } catch (err) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: (err as Error).message });
    }
  }
}
