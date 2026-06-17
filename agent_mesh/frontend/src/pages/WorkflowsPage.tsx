import { useEffect, useState } from "react";
import { AlertCircle, PlayCircle, RefreshCw, RotateCcw } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";
import type { DlqEvent, WorkflowRun } from "../lib/types";

function statusPill(status: string) {
  const map: Record<string, { bg: string; fg: string }> = {
    success: { bg: "rgba(34,197,94,.08)", fg: "var(--success)" },
    completed: { bg: "rgba(34,197,94,.08)", fg: "var(--success)" },
    failed: { bg: "rgba(239,68,68,.06)", fg: "var(--error)" },
    error: { bg: "rgba(239,68,68,.06)", fg: "var(--error)" },
    running: { bg: "rgba(26,58,58,.06)", fg: "var(--brand-teal)" },
    executing: { bg: "rgba(26,58,58,.06)", fg: "var(--brand-teal)" },
  };
  const style = map[status] ?? { bg: "var(--surface-card)", fg: "var(--muted)" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 9999,
        fontSize: 11,
        fontWeight: 700,
        color: style.fg,
        background: style.bg,
      }}
    >
      {status}
    </span>
  );
}

function shortId(id: string) {
  return id.length > 12 ? id.slice(0, 8) + "…" : id;
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowRun[]>([]);
  const [dlq, setDlq] = useState<DlqEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [tab, setTab] = useState<"runs" | "dlq">("runs");

  async function load() {
    setLoading(true);
    try {
      const res = await api.listWorkflows();
      setWorkflows(res.workflows);
      setDlq(res.dlq);
    } finally {
      setLoading(false);
    }
  }

  async function retry(runId: string) {
    setRetrying(runId);
    try {
      await api.retryWorkflow(runId);
      await load();
    } finally {
      setRetrying(null);
    }
  }

  useEffect(() => { void load(); }, []);

  const tabStyle = (active: boolean) => ({
    padding: "7px 16px",
    border: 0,
    borderRadius: 9999,
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    background: active ? "var(--surface-card)" : "transparent",
    color: active ? "var(--ink)" : "var(--muted)",
    transition: "all 150ms",
  });

  return (
    <div className="page">
      <PageHeader
        eyebrow="DBOS runs"
        title="Workflows"
        description="Agent workflow history, step timelines, and dead-letter queue for failed runs."
        actions={
          <button className="secondary-button" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
        <button style={tabStyle(tab === "runs")} onClick={() => setTab("runs")}>
          <PlayCircle size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />
          Runs ({workflows.length})
        </button>
        <button style={tabStyle(tab === "dlq")} onClick={() => setTab("dlq")}>
          <AlertCircle size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />
          Dead-letter queue ({dlq.length})
        </button>
      </div>

      {loading && <div className="empty-card">Loading…</div>}

      {!loading && tab === "runs" && (
        <div className="table-card">
          {workflows.length === 0 && (
            <div className="empty-card">No workflow runs yet. Start a session to generate runs.</div>
          )}
          {workflows.map((w) => (
            <article className="schedule-row" key={w.run_id}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {shortId(w.run_id)}
                  {statusPill(w.status)}
                </h3>
                <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                  {w.agent_id} · {w.step_count} step{w.step_count !== 1 ? "s" : ""} · last: {w.last_step}
                </p>
                <small style={{ color: "var(--muted-soft)" }}>
                  started {relTime(w.started_at)} · updated {relTime(w.updated_at)}
                </small>
              </div>
              {(w.status === "failed" || w.status === "error") && (
                <button
                  className="secondary-button"
                  onClick={() => retry(w.run_id)}
                  disabled={retrying === w.run_id}
                >
                  <RotateCcw size={13} />
                  {retrying === w.run_id ? "Retrying…" : "Retry"}
                </button>
              )}
            </article>
          ))}
        </div>
      )}

      {!loading && tab === "dlq" && (
        <div className="table-card">
          {dlq.length === 0 && (
            <div className="empty-card">Dead-letter queue is empty — no failed workflows.</div>
          )}
          {dlq.map((d) => (
            <article className="task-row" key={d.id}>
              <div>
                <div className="task-row-meta">
                  <span style={{ color: "var(--brand-coral)", fontWeight: 700 }}>DLQ</span>
                  <code>{shortId(d.run_id)}</code>
                </div>
                <h3>{d.agent_id}</h3>
                <p style={{ color: "var(--error)", fontFamily: "monospace", fontSize: 12 }}>{d.error}</p>
                <small style={{ color: "var(--muted-soft)" }}>{relTime(d.created_at)}</small>
              </div>
              <div className="task-row-side">
                <button
                  className="secondary-button"
                  onClick={() => retry(d.run_id)}
                  disabled={retrying === d.run_id}
                >
                  <RotateCcw size={13} />
                  {retrying === d.run_id ? "Retrying…" : "Retry"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
