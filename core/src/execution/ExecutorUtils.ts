import type { WorkflowDef, WorkflowTask } from '@agentmesh/common';
import type { WorkflowModel } from './types.js';

export const DECIDER_QUEUE = 'decider';

export function removeIterationFromTaskRefName(refName: string): string {
  const idx = refName.lastIndexOf('_');
  if (idx > 0) {
    const suffix = refName.substring(idx + 1);
    if (/^\d+$/.test(suffix)) {
      return refName.substring(0, idx);
    }
  }
  return refName;
}

export function appendIteration(refName: string, iteration: number): string {
  return `${refName}_${iteration}`;
}

export function hasInProgressHumanTask(workflow: WorkflowModel): boolean {
  return workflow.tasks.some((t) => t.taskType === 'HUMAN' && t.status === 'IN_PROGRESS');
}

export function getQueueName(task: { taskType: string; taskDefName?: string }): string {
  return task.taskDefName || task.taskType;
}

export function computePostpone(
  workflow: WorkflowModel,
  timeout: { seconds(): number },
  maxPostponeDurationSeconds: number,
): number {
  return Math.min(timeout.seconds(), maxPostponeDurationSeconds);
}

export function getTaskByRefName(def: WorkflowDef, refName: string): WorkflowTask | null {
  return def.tasks.find((t) => t.taskReferenceName === refName) ?? null;
}

export function getNextTask(def: WorkflowDef, refName: string): WorkflowTask | null {
  const idx = def.tasks.findIndex((t) => t.taskReferenceName === refName);
  if (idx < 0 || idx >= def.tasks.length - 1) return null;
  return def.tasks[idx + 1] ?? null;
}

export function workflowTaskHas(wft: WorkflowTask, refName: string): boolean {
  if (wft.loopOver?.some((t) => t.taskReferenceName === refName)) return true;
  for (const cases of Object.values(wft.decisionCases ?? {})) {
    if (cases.some((t) => t.taskReferenceName === refName)) return true;
  }
  if (wft.defaultCase?.some((t) => t.taskReferenceName === refName)) return true;
  for (const fork of wft.forkTasks ?? []) {
    if (fork.some((t) => t.taskReferenceName === refName)) return true;
  }
  return false;
}

export function workflowTaskNext(wft: WorkflowTask, refName: string): WorkflowTask | null {
  const allTasks = [
    ...(wft.loopOver ?? []),
    ...Object.values(wft.decisionCases ?? {}).flat(),
    ...(wft.defaultCase ?? []),
    ...(wft.forkTasks ?? []).flat(),
  ];
  const idx = allTasks.findIndex((t) => t.taskReferenceName === refName);
  if (idx < 0 || idx >= allTasks.length - 1) return null;
  return allTasks[idx + 1] ?? null;
}
