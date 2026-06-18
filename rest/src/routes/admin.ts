import { Router } from 'express';
import type { AdminService } from '../services/AdminService.js';

export function createAdminRouter(adminService: AdminService): Router {
  const router = Router();

  router.get('/admin/config', (_req, res) => {
    res.json(adminService.getAllConfig());
  });

  router.get('/admin/task/:tasktype', async (req, res) => {
    const start = parseInt(req.query.start as string, 10) || 0;
    const count = parseInt(req.query.count as string, 10) || 100;
    const tasks = await adminService.getListOfPendingTask(req.params.tasktype, start, count);
    res.json(tasks);
  });

  router.post('/admin/sweep/requeue/:workflowId', async (req, res) => {
    const result = await adminService.requeueSweep(req.params.workflowId);
    res.type('text/plain').send(result);
  });

  return router;
}
