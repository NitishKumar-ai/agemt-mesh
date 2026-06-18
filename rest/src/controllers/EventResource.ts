import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { EventService } from '../services/EventService.js';

@Controller('api/event')
export class EventResource {
  constructor(private readonly eventService: EventService) {}

  @Post()
  async addEventHandler(
    @Body() body: any,
    @Res() res: Response,
  ): Promise<void> {
    await this.eventService.addEventHandler(body);
    res.status(HttpStatus.NO_CONTENT).send();
  }

  @Put()
  async updateEventHandler(
    @Body() body: any,
    @Res() res: Response,
  ): Promise<void> {
    await this.eventService.updateEventHandler(body);
    res.status(HttpStatus.NO_CONTENT).send();
  }

  @Delete(':name')
  async removeEventHandlerStatus(
    @Param('name') name: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.eventService.removeEventHandlerStatus(name);
    res.status(HttpStatus.NO_CONTENT).send();
  }

  @Get()
  async getEventHandlers(): Promise<any> {
    return await this.eventService.getEventHandlers();
  }

  @Get(':event')
  async getEventHandlersForEvent(
    @Param('event') event: string,
    @Query('activeOnly') activeStr: string,
  ): Promise<any> {
    const activeOnly = activeStr !== 'false';
    return await this.eventService.getEventHandlersForEvent(event, activeOnly);
  }
}
