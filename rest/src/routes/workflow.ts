import { Router, type Request, type Response } from 'express';
import type { WorkflowService } from '../services/WorkflowService.js';

function param(p: string | string[] | undefined): string {
  if (Array.isArray(p)) return p[0] ?? '';
  return p ?? '';
}

export function createWorkflowRouter(workflowService: WorkflowService): Router {
  const router = Router();

  router.post('/workflow', async (req: Request, res: Response) => {
    try {
      const workflowId = await workflowService.startWorkflow(req.body);
      res.json(workflowId);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.post('/workflow/:name', async (req: Request, res: Response) => {
    try {
      const workflowId = await workflowService.startWorkflow({
        name: param(req.params.name),
        version: req.query.version ? Number(req.query.version) : undefined,
        correlationId: req.query.correlationId as string | undefined,
        input: req.body,
      });
      res.json(workflowId);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.get('/workflow/search', async (_req: Request, res: Response) => {
    const result = await workflowService.searchWorkflows();
    res.json(result);
  });

  router.get('/workflow/:workflowId/tasks', async (req: Request, res: Response) => {
    try {
      const start = parseInt(req.query.start as string, 10) || 0;
      const count = parseInt(req.query.count as string, 10) || 15;
      const status = req.query.status
        ? (req.query.status as string).split(',').map(s => s.trim())
        : undefined;
      const result = await workflowService.getWorkflowTasks(
        param(req.params.workflowId), start, count, status,
      );
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.get('/workflow/:workflowId', async (req: Request, res: Response) => {
    const includeTasks = req.query.includeTasks !== 'false';
    const workflowId = param(req.params.workflowId);
    const workflow = await workflowService.getWorkflow(workflowId, includeTasks);
    if (!workflow) {
      res.status(404).json({ error: `Workflow ${workflowId} not found` });
      return;
    }
    res.json(workflow);
  });

  router.get('/workflow/running/:name', async (req: Request, res: Response) => {
    const name = param(req.params.name);
    const version = req.query.version ? Number(req.query.version) : undefined;
    const ids = await workflowService.getRunningWorkflowIds(name, version);
    res.json(ids);
  });

  router.put('/workflow/:workflowId/decide', async (req: Request, res: Response) => {
    try {
      await workflowService.decideWorkflow(param(req.params.workflowId));
      res.status(204).send();
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.put('/workflow/:workflowId/pause', async (req: Request, res: Response) => {
    try {
      await workflowService.pauseWorkflow(param(req.params.workflowId));
      res.status(204).send();
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.put('/workflow/:workflowId/resume', async (req: Request, res: Response) => {
    try {
      await workflowService.resumeWorkflow(param(req.params.workflowId));
      res.status(204).send();
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.post('/workflow/:workflowId/rerun', async (req: Request, res: Response) => {
    try {
      const newWfId = await workflowService.rerunWorkflow(param(req.params.workflowId), req.body);
      res.json(newWfId);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.post('/workflow/:workflowId/restart', async (req: Request, res: Response) => {
    try {
      const useLatest = req.query.useLatestDefinitions === 'true';
      await workflowService.restartWorkflow(param(req.params.workflowId), useLatest);
      res.status(204).send();
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.post('/workflow/:workflowId/retry', async (req: Request, res: Response) => {
    try {
      const resumeSub = req.query.resumeSubworkflowTasks === 'true';
      await workflowService.retryWorkflow(param(req.params.workflowId), resumeSub);
      res.status(204).send();
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.post('/workflow/:workflowId/resetcallbacks', async (req: Request, res: Response) => {
    try {
      await workflowService.resetWorkflow(param(req.params.workflowId));
      res.status(204).send();
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.delete('/workflow/:workflowId', async (req: Request, res: Response) => {
    try {
      const reason = req.query.reason as string | undefined;
      await workflowService.terminateWorkflow(param(req.params.workflowId), reason);
      res.status(204).send();
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.delete('/workflow/:workflowId/remove', async (req: Request, res: Response) => {
    try {
      const archiveWorkflow = req.query.archiveWorkflow !== 'false';
      await workflowService.deleteWorkflow(param(req.params.workflowId), archiveWorkflow);
      res.status(204).send();
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.delete('/workflow/:workflowId/terminate-remove', async (req: Request, res: Response) => {
    try {
      const reason = req.query.reason as string | undefined;
      const archiveWorkflow = req.query.archiveWorkflow !== 'false';
      await workflowService.terminateRemove(param(req.params.workflowId), reason, archiveWorkflow);
      res.status(204).send();
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  return router;
}
