import { Router } from 'express';
import type { EventService } from '../services/EventService.js';

export function createEventRouter(eventService: EventService): Router {
  const router = Router();

  router.post('/event', async (req, res) => {
    await eventService.addEventHandler(req.body);
    res.status(204).send();
  });

  router.put('/event', async (req, res) => {
    await eventService.updateEventHandler(req.body);
    res.status(204).send();
  });

  router.delete('/event/:name', async (req, res) => {
    await eventService.removeEventHandlerStatus(req.params.name);
    res.status(204).send();
  });

  router.get('/event', async (_req, res) => {
    const handlers = await eventService.getEventHandlers();
    res.json(handlers);
  });

  router.get('/event/:event', async (req, res) => {
    const activeOnly = req.query.activeOnly !== 'false';
    const handlers = await eventService.getEventHandlersForEvent(req.params.event, activeOnly);
    res.json(handlers);
  });

  return router;
}
