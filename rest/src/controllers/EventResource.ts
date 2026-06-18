import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EventService } from '../services/EventService.js';

@ApiTags('event')
@Controller('api/event')
export class EventResource {
  constructor(private readonly eventService: EventService) {}

  @Post()
  async addEventHandler(@Body() body: any): Promise<void> {
    await this.eventService.addEventHandler(body);
  }

  @Put()
  async updateEventHandler(@Body() body: any): Promise<void> {
    await this.eventService.updateEventHandler(body);
  }

  @Get()
  async getEventHandlers(): Promise<any[]> {
    return await this.eventService.getEventHandlers();
  }

  @Get(':name')
  async getEventHandlersByName(@Param('name') name: string): Promise<any[]> {
    return await this.eventService.getEventHandlersForEvent(name);
  }

  @Get('queues')
  async getEventQueues(): Promise<any> {
    return {};
  }

  @Get('queues/providers')
  async getEventQueueProviders(): Promise<string[]> {
    return [];
  }
}
