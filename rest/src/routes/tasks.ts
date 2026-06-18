import { Router, type Request, type Response } from 'express';
import type { TaskStatus } from '@conductor/common';
import type { TaskService } from '../services/TaskService.js';

function asString(body: unknown): string {
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object') {
    if ('log' in (body as Record<string, unknown>)) return String((body as Record<string, unknown>).log);
  }
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

function param(p: string | string[] | undefined): string {
  if (Array.isArray(p)) return p[0] ?? '';
  return p ?? '';
}

export function createTaskRouter(taskService: TaskService): Router {
  const router = Router();

  // --- Polling (static paths before parameterized) ---

  router.get('/tasks/poll/batch/:tasktype', async (req: Request, res: Response) => {
    const count = req.query.count ? Number(req.query.count) : 1;
    const timeout = req.query.timeout ? Number(req.query.timeout) : 100;
    const tasks = await taskService.pollBatch(param(req.params.tasktype), count, timeout);
    res.json(tasks);
  });

  router.get('/tasks/poll/:tasktype', async (req: Request, res: Response) => {
    const workerId = req.query.workerid as string | undefined;
    const domain = req.query.domain as string | undefined;
    const task = await taskService.poll(param(req.params.tasktype), workerId, domain);
    if (!task) {
      res.status(204).send();
      return;
    }
    res.json(task);
  });

  // --- Queue info (static paths) ---

  router.get('/tasks/queue/sizes', async (req: Request, res: Response) => {
    const taskTypes = req.query.taskType as string | string[] | undefined;
    const types = taskTypes ? (Array.isArray(taskTypes) ? taskTypes : [taskTypes]) : [];
    const sizes = await taskService.getTaskQueueSizes(types);
    res.json(sizes);
  });

  router.get('/tasks/queue/size', async (req: Request, res: Response) => {
    const taskType = req.query.taskType as string;
    const size = await taskService.getTaskQueueSize(taskType);
    res.json(size);
  });

  router.get('/tasks/queue/all/verbose', async (_req: Request, res: Response) => {
    const details = await taskService.allVerbose();
    res.json(details);
  });

  router.get('/tasks/queue/all', async (_req: Request, res: Response) => {
    const details = await taskService.getAllQueueDetails();
    res.json(details);
  });

  router.get('/tasks/queue/polldata/all', async (_req: Request, res: Response) => {
    const data = await taskService.getAllPollData();
    res.json(data);
  });

  router.get('/tasks/queue/polldata', async (req: Request, res: Response) => {
    const taskType = req.query.taskType as string;
    const data = await taskService.getPollData(taskType);
    res.json(data);
  });

  router.post('/tasks/queue/requeue/:taskType', async (req: Request, res: Response) => {
    const result = await taskService.requeuePendingTask(param(req.params.taskType));
    res.type('text/plain').send(result);
  });

  // --- Search (static paths) ---

  router.get('/tasks/search', async (req: Request, res: Response) => {
    const start = req.query.start ? Number(req.query.start) : 0;
    const size = req.query.size ? Number(req.query.size) : 100;
    const sort = req.query.sort as string | undefined;
    const freeText = req.query.freeText as string | undefined;
    const query = req.query.query as string | undefined;
    const result = await taskService.search(start, size, sort, freeText, query);
    res.json(result);
  });

  router.get('/tasks/search-v2', async (req: Request, res: Response) => {
    const start = req.query.start ? Number(req.query.start) : 0;
    const size = req.query.size ? Number(req.query.size) : 100;
    const sort = req.query.sort as string | undefined;
    const freeText = req.query.freeText as string | undefined;
    const query = req.query.query as string | undefined;
    const result = await taskService.searchV2(start, size, sort, freeText, query);
    res.json(result);
  });

  router.get('/tasks/externalstoragelocation', async (req: Request, res: Response) => {
    const path = req.query.path as string;
    const operation = req.query.operation as string;
    const payloadType = req.query.payloadType as string;
    const location = await taskService.getExternalStorageLocation(path, operation, payloadType);
    res.json(location);
  });

  router.get('/tasks/external-storage-location', async (req: Request, res: Response) => {
    const path = req.query.path as string;
    const operation = req.query.operation as string;
    const payloadType = req.query.payloadType as string;
    const location = await taskService.getExternalStorageLocation(path, operation, payloadType);
    res.json(location);
  });

  // --- Update v2 (static path before parameterized) ---

  router.post('/tasks/update-v2', async (req: Request, res: Response) => {
    try {
      const task = await taskService.updateTaskV2(req.body);
      if (!task) {
        res.status(204).send();
        return;
      }
      res.json(task);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- By-ref-name update with sync (more specific before less specific) ---

  router.post('/tasks/:workflowId/:taskRefName/:status/sync', async (req: Request, res: Response) => {
    try {
      const workflowId = param(req.params.workflowId);
      const taskRefName = param(req.params.taskRefName);
      const status = param(req.params.status) as TaskStatus;
      const workerId = req.query.workerid as string | undefined;

      const pending = await taskService.getPendingTaskForWorkflow(workflowId, taskRefName);
      if (!pending) {
        res.status(404).json({ error: `No running task ${taskRefName} for workflow ${workflowId}` });
        return;
      }

      const updated = await taskService.updateTask(pending.taskId!, {
        workflowInstanceId: pending.workflowInstanceId!,
        status,
        outputData: req.body,
        workerId,
      });

      const workflow = await taskService.getWorkflowForTask(pending.taskId!);
      res.json(workflow);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.post('/tasks/:workflowId/:taskRefName/:status', async (req: Request, res: Response) => {
    try {
      const workflowId = param(req.params.workflowId);
      const taskRefName = param(req.params.taskRefName);
      const tasks = await taskService.getTasksByRefName(workflowId, taskRefName);
      if (tasks.length === 0) {
        res.status(404).json({ error: `Task ${taskRefName} not found in workflow ${workflowId}` });
        return;
      }
      const task = tasks[0]!;
      if (!task.taskId) {
        res.status(400).json({ error: 'Task has no taskId' });
        return;
      }
      await taskService.updateTask(task.taskId, {
        workflowInstanceId: task.taskId,
        status: param(req.params.status) as TaskStatus,
        outputData: req.body,
        workerId: req.query.workerid ? String(req.query.workerid) : undefined,
      });
      res.status(200).send(task.taskId);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Task logs (more specific before :taskId) ---

  router.post('/tasks/:taskId/log', async (req: Request, res: Response) => {
    try {
      const taskId = param(req.params.taskId);
      const logMessage = asString(req.body);
      await taskService.log(taskId, logMessage);
      res.status(200).send();
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.get('/tasks/:taskId/log', async (req: Request, res: Response) => {
    const taskId = param(req.params.taskId);
    const logs = await taskService.getTaskLogs(taskId);
    if (logs.length === 0) {
      res.status(204).send();
      return;
    }
    res.json(logs);
  });

  // --- Single task operations ---

  router.get('/tasks/:taskId', async (req: Request, res: Response) => {
    const taskId = param(req.params.taskId);
    const task = await taskService.getTask(taskId);
    if (!task) {
      res.status(404).json({ error: `Task ${taskId} not found` });
      return;
    }
    res.json(task);
  });

  // --- Update task (least specific, POST to /tasks) ---

  router.post('/tasks', async (req: Request, res: Response) => {
    try {
      const taskId = req.body.taskId || req.body.workflowInstanceId;
      await taskService.updateTask(taskId, req.body);
      res.status(200).send(taskId);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  return router;
}