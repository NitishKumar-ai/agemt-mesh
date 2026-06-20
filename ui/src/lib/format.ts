import type { MeshEvent } from './types';

export function shortTime(value?: string | number | Date): string {
  if (value === undefined || value === null) return '—';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString();
}

export function eventTitle(event: MeshEvent): string {
  return String(event.title ?? event.eventType ?? event.type ?? 'Agent Mesh event');
}

export function eventBody(event: MeshEvent): string {
  const body = event.body ?? event.message ?? event.detail ?? event.data;
  return typeof body === 'string' ? body : body ? JSON.stringify(body) : '';
}
