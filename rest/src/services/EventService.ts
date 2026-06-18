import type { EventHandler } from '@conductor/common';
import type { MetadataDAO } from '@conductor/common-persistence';

export class EventService {
  constructor(private readonly metadataDAO: MetadataDAO) {}

  async addEventHandler(handler: EventHandler): Promise<void> {
    await this.metadataDAO.addEventHandler(handler);
  }

  async updateEventHandler(handler: EventHandler): Promise<void> {
    await this.metadataDAO.updateEventHandler(handler);
  }

  async removeEventHandlerStatus(name: string): Promise<void> {
    await this.metadataDAO.removeEventHandlerStatus(name);
  }

  async getEventHandlers(): Promise<EventHandler[]> {
    return this.metadataDAO.getAllEventHandlers();
  }

  async getEventHandlersForEvent(event: string, activeOnly = true): Promise<EventHandler[]> {
    return this.metadataDAO.getEventHandlersForEvent(event, activeOnly);
  }
}
