import { Braces, FileText, GitPullRequest, ListChecks, ScrollText } from "lucide-react";
import { useState } from "react";
import type { MeshEvent } from "../lib/types";
import { shortTime } from "../lib/format";

type Tab = "details" | "diff" | "logs" | "events";

export function ContextPane({ events, workflowId }: { events: MeshEvent[]; workflowId?: string }) {
  const [tab, setTab] = useState<Tab>("details");
  const latestApproval = events.find((event) => event.eventType.includes("approval"));

  return (
    <aside className="context-pane">
      <div className="context-tabs">
        <button className={tab === "details" ? "active" : ""} onClick={() => setTab("details")}><ListChecks size={15} />Details</button>
        <button className={tab === "diff" ? "active" : ""} onClick={() => setTab("diff")}><GitPullRequest size={15} />Diff</button>
        <button className={tab === "logs" ? "active" : ""} onClick={() => setTab("logs")}><ScrollText size={15} />Logs</button>
        <button className={tab === "events" ? "active" : ""} onClick={() => setTab("events")}><Braces size={15} />Events</button>
      </div>

      {tab === "details" && (
        <div className="pane-section">
          <h3>Session details</h3>
          <dl className="detail-list">
            <div><dt>Agent</dt><dd>CommitGuard</dd></div>
            <div><dt>Workflow</dt><dd>{workflowId ?? "Not started"}</dd></div>
            <div><dt>Mode</dt><dd>Plan · Execute · Review</dd></div>
            <div><dt>Sandbox</dt><dd>E2B when configured, mock fallback locally</dd></div>
          </dl>
        </div>
      )}

      {tab === "diff" && (
        <div className="pane-section">
          <h3>Proposed change</h3>
          {latestApproval ? (
            <pre className="diff-block">
              <span>+ {String(latestApproval.payload.add ?? "No additions in current payload")}</span>
              <span>- {String(latestApproval.payload.sub ?? "No removals in current payload")}</span>
            </pre>
          ) : (
            <EmptyPane icon={FileText} text="Diffs appear here when an agent asks for approval." />
          )}
        </div>
      )}

      {tab === "logs" && (
        <div className="pane-section">
          <h3>Sandbox logs</h3>
          <pre className="log-block">
            {events.length ? events.map((event) => `[${shortTime(event.time)}] ${event.agentId}: ${event.eventType}`).join("\n") : "No tool logs yet."}
          </pre>
        </div>
      )}

      {tab === "events" && (
        <div className="pane-section">
          <h3>Raw events</h3>
          <pre className="json-block">{JSON.stringify(events.slice(0, 12), null, 2)}</pre>
        </div>
      )}
    </aside>
  );
}

function EmptyPane({ icon: Icon, text }: { icon: typeof FileText; text: string }) {
  return (
    <div className="empty-pane">
      <Icon size={22} />
      <p>{text}</p>
    </div>
  );
}
