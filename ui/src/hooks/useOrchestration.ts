import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orchestrationApi } from '../lib/orchestrationApi';

// ── Workflow Definitions ────────────────────────────────────────────────

export function useWorkflowDefs() {
  return useQuery({
    queryKey: ['workflowDefs'],
    queryFn: orchestrationApi.listWorkflowDefs,
  });
}

export function useWorkflowDef(name: string, version?: number) {
  return useQuery({
    queryKey: ['workflowDef', name, version],
    queryFn: () => orchestrationApi.getWorkflowDef(name, version),
    enabled: !!name,
  });
}

export function useSaveWorkflowDef() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: orchestrationApi.saveWorkflowDef,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflowDefs'] }),
  });
}

// ── Task Definitions ────────────────────────────────────────────────────

export function useTaskDefs() {
  return useQuery({
    queryKey: ['taskDefs'],
    queryFn: orchestrationApi.listTaskDefs,
  });
}

export function useTaskDef(name: string) {
  return useQuery({
    queryKey: ['taskDef', name],
    queryFn: () => orchestrationApi.getTaskDef(name),
    enabled: !!name,
  });
}

export function useSaveTaskDef() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: orchestrationApi.saveTaskDef,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taskDefs'] }),
  });
}

// ── Workflow Executions ─────────────────────────────────────────────────

export function useExecutions(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['executions', params],
    queryFn: () => orchestrationApi.searchExecutions(params),
  });
}

export function useExecution(id: string) {
  return useQuery({
    queryKey: ['execution', id],
    queryFn: () => orchestrationApi.getExecution(id),
    enabled: !!id,
  });
}

// ── Event Handlers ──────────────────────────────────────────────────────

export function useEventHandlers() {
  return useQuery({
    queryKey: ['eventHandlers'],
    queryFn: orchestrationApi.listEventHandlers,
  });
}

// ── Schedulers ──────────────────────────────────────────────────────────

export function useSchedules() {
  return useQuery({
    queryKey: ['schedules'],
    queryFn: orchestrationApi.listSchedules,
  });
}

// ── Monitoring ──────────────────────────────────────────────────────────

export function useTaskQueues() {
  return useQuery({
    queryKey: ['taskQueues'],
    queryFn: orchestrationApi.getTaskQueues,
    refetchInterval: 10_000,
  });
}

export function useEventQueues() {
  return useQuery({
    queryKey: ['eventQueues'],
    queryFn: orchestrationApi.getEventQueues,
    refetchInterval: 10_000,
  });
}
