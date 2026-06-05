import type { MeshEvent } from "./types";

export function connectEventStream(
  onEvent: (event: MeshEvent) => void,
  onStateChange: (state: "connected" | "reconnecting" | "closed") => void
) {
  const source = new EventSource("/stream");

  source.onopen = () => onStateChange("connected");
  source.onerror = () => onStateChange("reconnecting");
  source.onmessage = (message) => {
    try {
      const data = JSON.parse(message.data) as {
        agent_id?: string;
        event_type?: string;
        payload?: Record<string, unknown>;
      };
      onEvent({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        time: new Date(),
        agentId: data.agent_id ?? "Agent",
        eventType: data.event_type ?? "event",
        payload: data.payload ?? {}
      });
    } catch {
      onEvent({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        time: new Date(),
        agentId: "Event Stream",
        eventType: "raw_message",
        payload: { message: message.data }
      });
    }
  };

  return () => {
    source.close();
    onStateChange("closed");
  };
}
