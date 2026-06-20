import {
  Controller, Get, Post, Put, Delete,
  Param, Query, Body, HttpException, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrchestrationService, StoredSchedule } from '../services/OrchestrationService.js';
import { OidcAuthGuard } from '../OidcAuthGuard.js';

@ApiTags('orchestration')
@UseGuards(OidcAuthGuard)
@Controller('api/orchestration')
export class OrchestrationController {
  constructor(private readonly svc: OrchestrationService) {}

  // ── Workflow Definitions ──────────────────────────────────────────

  @Get('metadata/workflow')
  async listWorkflowDefs() {
    return this.svc.listWorkflowDefs();
  }

  @Get('metadata/workflow/:name')
  async getWorkflowDef(
    @Param('name') name: string,
    @Query('version') version?: string,
  ) {
    const def = await this.svc.getWorkflowDef(name, version ? parseInt(version, 10) : undefined);
    if (!def) throw new HttpException(`WorkflowDef ${name} not found`, HttpStatus.NOT_FOUND);
    return def;
  }

  @Post('metadata/workflow')
  async saveWorkflowDef(@Body() body: any) {
    await this.svc.saveWorkflowDef(body);
    return { status: 'CREATED' };
  }

  @Put('metadata/workflow')
  async updateWorkflowDef(@Body() body: any) {
    await this.svc.saveWorkflowDef(body);
    return { status: 'UPDATED' };
  }

  @Delete('metadata/workflow/:name')
  async deleteWorkflowDef(
    @Param('name') name: string,
    @Query('version') version?: string,
  ) {
    await this.svc.deleteWorkflowDef(name, version ? parseInt(version, 10) : undefined);
    return { status: 'DELETED' };
  }

  // ── Task Definitions ──────────────────────────────────────────────

  @Get('metadata/taskdef')
  async listTaskDefs() {
    return this.svc.listTaskDefs();
  }

  @Get('metadata/taskdef/:name')
  async getTaskDef(@Param('name') name: string) {
    const def = await this.svc.getTaskDef(name);
    if (!def) throw new HttpException(`TaskDef ${name} not found`, HttpStatus.NOT_FOUND);
    return def;
  }

  @Post('metadata/taskdef')
  async saveTaskDef(@Body() body: any) {
    await this.svc.saveTaskDef(body);
    return { status: 'CREATED' };
  }

  @Put('metadata/taskdef')
  async updateTaskDef(@Body() body: any) {
    await this.svc.saveTaskDef(body);
    return { status: 'UPDATED' };
  }

  @Delete('metadata/taskdef/:name')
  async deleteTaskDef(@Param('name') name: string) {
    await this.svc.deleteTaskDef(name);
    return { status: 'DELETED' };
  }

  // ── Workflow Executions ───────────────────────────────────────────

  @Get('workflow/search')
  async searchExecutions(@Query() params: Record<string, string>) {
    return this.svc.searchExecutions(params);
  }

  @Get('workflow/:id')
  async getExecution(@Param('id') id: string) {
    const exec = await this.svc.getExecution(id);
    if (!exec) throw new HttpException(`Execution ${id} not found`, HttpStatus.NOT_FOUND);
    return exec;
  }

  @Get('workflow/:id/tasks')
  async getExecutionTasks(@Param('id') id: string) {
    return this.svc.getExecutionTasks(id);
  }

  // ── Task Search ───────────────────────────────────────────────────

  @Get('tasks/search')
  async searchTasks(@Query() params: Record<string, string>) {
    return this.svc.searchTasks(params);
  }

  // ── Event Handlers ────────────────────────────────────────────────

  @Get('eventhandler')
  async listEventHandlers() {
    return this.svc.listEventHandlers();
  }

  @Get('eventhandler/:name')
  async getEventHandler(@Param('name') name: string) {
    const handler = await this.svc.getEventHandler(name);
    if (!handler) throw new HttpException(`EventHandler ${name} not found`, HttpStatus.NOT_FOUND);
    return handler;
  }

  @Post('eventhandler')
  async saveEventHandler(@Body() body: any) {
    await this.svc.saveEventHandler(body);
    return { status: 'CREATED' };
  }

  @Delete('eventhandler/:name')
  async deleteEventHandler(@Param('name') name: string) {
    await this.svc.deleteEventHandler(name);
    return { status: 'DELETED' };
  }

  // ── Scheduler ─────────────────────────────────────────────────────

  @Get('scheduler')
  async listSchedules() {
    return this.svc.listSchedules();
  }

  @Get('scheduler/:name')
  async getSchedule(@Param('name') name: string) {
    const schedule = await this.svc.getSchedule(name);
    if (!schedule) throw new HttpException(`Schedule ${name} not found`, HttpStatus.NOT_FOUND);
    return schedule;
  }

  @Post('scheduler')
  async saveSchedule(@Body() body: any) {
    await this.svc.saveSchedule(body);
    return { status: 'CREATED' };
  }

  @Delete('scheduler/:name')
  async deleteSchedule(@Param('name') name: string) {
    const deleted = await this.svc.deleteSchedule(name);
    if (!deleted) throw new HttpException(`Schedule ${name} not found`, HttpStatus.NOT_FOUND);
    return { status: 'DELETED' };
  }

  // ── Schemas ───────────────────────────────────────────────────────

  @Get('schema')
  async listSchemas() {
    return this.svc.listSchemas();
  }

  @Get('schema/:name')
  async getSchema(@Param('name') name: string, @Query('version') version?: string) {
    const schema = await this.svc.getSchema(name, version ? parseInt(version, 10) : undefined);
    if (!schema) throw new HttpException(`Schema ${name} not found`, HttpStatus.NOT_FOUND);
    return schema;
  }

  // ── Monitoring ────────────────────────────────────────────────────

  @Get('tasks/queue/all')
  async getTaskQueues() {
    return this.svc.getTaskQueues();
  }

  @Get('eventqueues')
  async getEventQueues() {
    return this.svc.getEventQueues();
  }
}
