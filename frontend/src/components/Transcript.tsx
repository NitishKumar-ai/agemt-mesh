import { Check, ChevronDown, Clock, Terminal, UserRound } from "lucide-react";
import { eventBody, eventTitle, shortTime } from "../lib/format";
import type { MeshEvent, SessionMessage } from "../lib/types";
import { StatusBadge } from "./StatusBadge";

type Props = {
  messages: SessionMessage[];
  events: MeshEvent[];
  workflowId?: string;
  onApprove: (approved: boolean) => void;
};

export function Transcript({ messages, events, workflowId, onApprove }: Props) {
  return (
    <div className="transcript">
      {messages.map((message) => (
        <article key={message.id} className={`message message--${message.role}`}>
          <div className="message-avatar">{message.role === "user" ? <UserRound size={17} /> : <Terminal size={17} />}</div>
          <div className="message-card">
            <div className="message-meta">
              <strong>{message.title ?? (message.role === "user" ? "You" : "Agent Mesh")}</strong>
              <span>{shortTime(message.time)}</span>
              {message.status && <StatusBadge status={message.status} />}
            </div>
            <p>{message.body}</p>
          </div>
        </article>
      ))}

      {events
        .slice()
        .reverse()
        .map((event) => {
          const needsApproval = event.eventType.includes("approval");
          return (
            <article key={event.id} className={`step-card ${needsApproval ? "step-card--approval" : ""}`}>
              <div className="step-icon">{needsApproval ? <Clock size={17} /> : <Check size={17} />}</div>
              <div className="step-body">
                <div className="step-head">
                  <div>
                    <strong>{eventTitle(event)}</strong>
                    <span>{event.agentId} · {shortTime(event.time)}</span>
                  </div>
                  <ChevronDown size={16} />
                </div>
                <pre>{eventBody(event)}</pre>
                {needsApproval && (
                  <div className="approval-actions">
                    <button className="secondary-button" type="button" disabled={!workflowId} onClick={() => onApprove(false)}>
                      Reject
                    </button>
                    <button className="primary-button" type="button" disabled={!workflowId} onClick={() => onApprove(true)}>
                      Approve
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
    </div>
  );
}
