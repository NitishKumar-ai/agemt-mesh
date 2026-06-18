import { Router } from 'express';
import type { VersionService } from '../services/VersionService.js';

export function createVersionRouter(versionService: VersionService): Router {
  const router = Router();

  router.get('/version', (_req, res) => {
    res.type('text/plain').send(versionService.getVersion());
  });

  return router;
}
