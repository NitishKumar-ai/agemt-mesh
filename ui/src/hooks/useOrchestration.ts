import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { conductorApi } from '../lib/conductorApi';
import type {
  WorkflowDef, TaskDef, WorkflowExecution, EventHandler, Schedule,
} from '../lib/conductorTypes';

// ── Workflow Definitions ────────────────────────────────────────────────

export function useWorkflowDefs() {
  return useQuery({
    queryKey: ['workflowDefs'],
    queryFn: conductorApi.listWorkflowDefs,
  });
}

export function useWorkflowDef(name: string, version?: number) {
  return useQuery({
    queryKey: ['workflowDef', name, version],
    queryFn: () => conductorApi.getWorkflowDef(name, version),
    enabled: !!name,
  });
}

export function useSaveWorkflowDef() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: conductorApi.saveWorkflowDef,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflowDefs'] }),
  });
}

// ── Task Definitions ────────────────────────────────────────────────────

export function useTaskDefs() {
  return useQuery({
    queryKey: ['taskDefs'],
    queryFn: conductorApi.listTaskDefs,
  });
}

export function useTaskDef(name: string) {
  return useQuery({
    queryKey: ['taskDef', name],
    queryFn: () => conductorApi.getTaskDef(name),
    enabled: !!name,
  });
}

export function useSaveTaskDef() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: conductorApi.saveTaskDef,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taskDefs'] }),
  });
}

// ── Workflow Executions ─────────────────────────────────────────────────

export function useExecutions(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['executions', params],
    queryFn: () => conductorApi.searchExecutions(params),
  });
}

export function useExecution(id: string) {
  return useQuery({
    queryKey: ['execution', id],
    queryFn: () => conductorApi.getExecution(id),
    enabled: !!id,
  });
}

// ── Event Handlers ──────────────────────────────────────────────────────

export function useEventHandlers() {
  return useQuery({
    queryKey: ['eventHandlers'],
    queryFn: conductorApi.listEventHandlers,
  });
}

// ── Schedulers ──────────────────────────────────────────────────────────

export function useSchedules() {
  return useQuery({
    queryKey: ['schedules'],
    queryFn: conductorApi.listSchedules,
  });
}

// ── Monitoring ──────────────────────────────────────────────────────────

export function useTaskQueues() {
  return useQuery({
    queryKey: ['taskQueues'],
    queryFn: conductorApi.getTaskQueues,
    refetchInterval: 10_000,
  });
}

export function useEventQueues() {
  return useQuery({
    queryKey: ['eventQueues'],
    queryFn: conductorApi.getEventQueues,
    refetchInterval: 10_000,
  });
}
