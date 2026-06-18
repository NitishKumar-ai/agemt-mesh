/**
 * Health check router.
 *
 * GET /health
 *   Returns a JSON payload used by the deploy script, Docker HEALTHCHECK,
 *   and systemd liveness probes.
 *
 * Response shape:
 *   { status: "UP" | "DOWN", version: string, db: "ok" | "error", uptimeSeconds: number }
 *
 * The optional dbProbe callback performs a lightweight DB connectivity check
 * (e.g. SELECT 1).  If the probe throws, status becomes "DOWN" and the
 * response has HTTP 503.
 */

import { Router, type Request, type Response } from 'express';

const startTime = Date.now();

export type DbProbe = () => Promise<void>;

export function createHealthRouter(version = '0.0.0', dbProbe?: DbProbe): Router {
  const router = Router();

  router.get('/health', async (_req: Request, res: Response) => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    let dbStatus: 'ok' | 'error' = 'ok';

    if (dbProbe) {
      try {
        await dbProbe();
      } catch {
        dbStatus = 'error';
      }
    }

    const isUp = dbStatus === 'ok';

    res.status(isUp ? 200 : 503).json({
      status: isUp ? 'UP' : 'DOWN',
      version,
      db: dbStatus,
      uptimeSeconds,
    });
  });

  return router;
}
