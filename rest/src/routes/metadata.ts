import { Router, type Request, type Response } from 'express';
import { WorkflowDefSchema, TaskDefSchema } from '@conductor/common';
import type { MetadataService } from '../services/MetadataService.js';

function param(p: string | string[] | undefined): string {
  if (Array.isArray(p)) return p[0] ?? '';
  return p ?? '';
}

export function createMetadataRouter(metadataService: MetadataService): Router {
  const router = Router();

  // --- Workflow definitions ---

  router.post('/metadata/workflow/validate', async (req: Request, res: Response) => {
    try {
      const parsed = WorkflowDefSchema.parse(req.body);
      await metadataService.validateWorkflowDef(parsed);
      res.status(200).send();
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.post('/metadata/workflow', async (req: Request, res: Response) => {
    try {
      const parsed = WorkflowDefSchema.parse(req.body);
      await metadataService.registerWorkflowDef(parsed);
      res.status(201).send();
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.put('/metadata/workflow', async (req: Request, res: Response) => {
    try {
      const body = Array.isArray(req.body) ? req.body : [req.body];
      const defs = body.map((d: unknown) => WorkflowDefSchema.parse(d));
      const result = await metadataService.updateWorkflowDefs(defs);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.get('/metadata/workflow/names-and-versions', async (_req: Request, res: Response) => {
    const result = await metadataService.getWorkflowNamesAndVersions();
    res.json(result);
  });

  router.get('/metadata/workflow/names', async (_req: Request, res: Response) => {
    const names = await metadataService.getWorkflowNames();
    res.json(names);
  });

  router.get('/metadata/workflow/latest-versions', async (_req: Request, res: Response) => {
    const defs = await metadataService.getLatestVersions();
    res.json(defs);
  });

  router.get('/metadata/workflow/:name/versions', async (req: Request, res: Response) => {
    const name = param(req.params.name);
    const versions = await metadataService.getWorkflowVersions(name);
    res.json(versions);
  });

  router.get('/metadata/workflow/:name', async (req: Request, res: Response) => {
    const name = param(req.params.name);
    const version = req.query.version ? Number(req.query.version) : undefined;
    const def = await metadataService.getWorkflowDef(name, version);
    if (!def) {
      res.status(404).json({ error: `WorkflowDef ${name} not found` });
      return;
    }
    res.json(def);
  });

  router.get('/metadata/workflow', async (_req: Request, res: Response) => {
    const defs = await metadataService.getWorkflowDefs();
    res.json(defs);
  });

  router.delete('/metadata/workflow/:name/:version', async (req: Request, res: Response) => {
    try {
      await metadataService.removeWorkflowDef(param(req.params.name), Number(param(req.params.version)));
      res.status(204).send();
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Task definitions ---

  router.post('/metadata/taskdefs', async (req: Request, res: Response) => {
    try {
      const body = Array.isArray(req.body) ? req.body : [req.body];
      const defs = body.map((d: unknown) => TaskDefSchema.parse(d));
      await metadataService.registerTaskDefs(defs);
      res.status(201).send();
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.put('/metadata/taskdefs', async (req: Request, res: Response) => {
    try {
      const parsed = TaskDefSchema.parse(req.body);
      await metadataService.updateTaskDef(parsed);
      res.status(204).send();
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.get('/metadata/taskdefs', async (_req: Request, res: Response) => {
    const defs = await metadataService.getTaskDefs();
    res.json(defs);
  });

  router.get('/metadata/taskdefs/:tasktype', async (req: Request, res: Response) => {
    const taskType = param(req.params.tasktype);
    const def = await metadataService.getTaskDef(taskType);
    if (!def) {
      res.status(404).json({ error: `TaskDef ${taskType} not found` });
      return;
    }
    res.json(def);
  });

  router.delete('/metadata/taskdefs/:tasktype', async (req: Request, res: Response) => {
    try {
      await metadataService.removeTaskDef(param(req.params.tasktype));
      res.status(204).send();
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  return router;
}