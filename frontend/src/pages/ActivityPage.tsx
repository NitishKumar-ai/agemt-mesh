import { Radio } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { eventBody, eventTitle, shortTime } from "../lib/format";
import type { MeshEvent } from "../lib/types";

export function ActivityPage({ events, streamState }: { events: MeshEvent[]; streamState: string }) {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Live stream"
        title="Activity"
        description="Raw event stream from active agents, workflows, approvals, and scheduled tasks."
        actions={<span className={`stream-pill stream-pill--${streamState}`}><Radio size={14} />{streamState}</span>}
      />
      <div className="activity-list">
        {events.length === 0 && <div className="empty-card">No streamed events yet. Start a session to watch activity here.</div>}
        {events.map((event) => (
          <article className="activity-row" key={event.id}>
            <div>
              <strong>{eventTitle(event)}</strong>
              <span>{event.agentId} · {shortTime(event.time)}</span>
            </div>
            <pre>{eventBody(event)}</pre>
          </article>
        ))}
      </div>
    </div>
  );
}
