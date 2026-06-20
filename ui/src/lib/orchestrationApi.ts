import type {
  EventHandler,
  EventQueueDetail,
  Schedule,
  SearchResult,
  TaskDef,
  TaskQueueDetail,
  WorkflowDef,
  WorkflowExecution,
} from './orchestrationTypes';

const API_ROOT = '/api/orchestration';

function createQuery(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  }

  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Agent Mesh API request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function save<T>(path: string, value: T): Promise<{ status: string }> {
  return request(path, {
    method: 'POST',
    body: JSON.stringify(value),
  });
}

export const orchestrationApi = {
  listWorkflowDefs: () => request<WorkflowDef[]>('/metadata/workflow'),

  getWorkflowDef: (name: string, version?: number) =>
    request<WorkflowDef>(
      `/metadata/workflow/${encodeURIComponent(name)}${createQuery({ version })}`,
    ),

  saveWorkflowDef: (definition: WorkflowDef) =>
    save('/metadata/workflow', definition),

  listTaskDefs: () => request<TaskDef[]>('/metadata/taskdef'),

  getTaskDef: (name: string) =>
    request<TaskDef>(`/metadata/taskdef/${encodeURIComponent(name)}`),

  saveTaskDef: (definition: TaskDef) => save('/metadata/taskdef', definition),

  searchExecutions: (params?: Record<string, string>) =>
    request<SearchResult<WorkflowExecution>>(`/workflow/search${createQuery(params)}`),

  getExecution: (id: string) =>
    request<WorkflowExecution>(`/workflow/${encodeURIComponent(id)}`),

  listEventHandlers: () => request<EventHandler[]>('/eventhandler'),

  listSchedules: () => request<Schedule[]>('/scheduler'),

  getTaskQueues: () =>
    request<Record<string, TaskQueueDetail>>('/tasks/queue/all'),

  getEventQueues: () => request<EventQueueDetail[]>('/eventqueues'),
};
