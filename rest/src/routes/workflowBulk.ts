import { Router } from 'express';
import type { WorkflowBulkService } from '../services/WorkflowBulkService.js';

export function createWorkflowBulkRouter(bulkService: WorkflowBulkService): Router {
  const router = Router();

  router.put('/workflow/bulk/pause', async (req, res) => {
    const result = await bulkService.pauseWorkflow(req.body);
    res.json(result);
  });

  router.put('/workflow/bulk/resume', async (req, res) => {
    const result = await bulkService.resumeWorkflow(req.body);
    res.json(result);
  });

  router.post('/workflow/bulk/terminate', async (req, res) => {
    const reason = req.query.reason as string | undefined;
    const result = await bulkService.terminate(req.body, reason);
    res.json(result);
  });

  router.delete('/workflow/bulk/remove', async (req, res) => {
    const archiveWorkflow = req.query.archiveWorkflow !== 'false';
    const result = await bulkService.deleteWorkflow(req.body, archiveWorkflow);
    res.json(result);
  });

  router.post('/workflow/bulk/restart', async (req, res) => {
    const useLatest = req.query.useLatestDefinitions === 'true';
    const result = await bulkService.restart(req.body, useLatest);
    res.json(result);
  });

  router.post('/workflow/bulk/retry', async (req, res) => {
    const resumeSub = req.query.resumeSubworkflowTasks === 'true';
    const result = await bulkService.retry(req.body, resumeSub);
    res.json(result);
  });

  return router;
}
