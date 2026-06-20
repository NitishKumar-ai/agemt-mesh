import type { MeshEvent } from './types';

export function connectEventStream(
  onEvent: (event: MeshEvent) => void,
  onStateChange: (state: 'connected' | 'reconnecting' | 'closed') => void,
): () => void {
  const source = new EventSource('/api/agents/events');
  onStateChange('reconnecting');

  source.onopen = () => onStateChange('connected');
  source.onmessage = (message) => {
    try {
      onEvent(JSON.parse(message.data) as MeshEvent);
    } catch {
      // Ignore malformed events while keeping the stream alive.
    }
  };
  source.onerror = () => onStateChange('reconnecting');

  return () => {
    source.close();
    onStateChange('closed');
  };
}
