import { useEffect, useState } from "react";
import { ChevronRight, Clock, Files, RefreshCw } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";
import type { AgentSession, AgentStep } from "../lib/types";

function statusColor(status: string) {
  if (status === "success" || status === "completed") return "var(--success)";
  if (status === "failed" || status === "error") return "var(--error)";
  if (status === "running" || status === "executing") return "var(--primary)";
  return "var(--muted)";
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

export function SessionsPage() {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSteps, setLoadingSteps] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await api.listSessions();
      setSessions(res.sessions);
    } finally {
      setLoading(false);
    }
  }

  async function openSession(runId: string) {
    setSelected(runId);
    setLoadingSteps(true);
    try {
      const res = await api.getSession(runId);
      setSteps(res.steps);
    } finally {
      setLoadingSteps(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <div className="page page--split">
      <section>
        <PageHeader
          eyebrow="Durable history"
          title="Sessions"
          description="Resumable agent threads with status, steps, and final outcomes."
          actions={
            <button className="secondary-button" onClick={load}>
              <RefreshCw size={14} /> Refresh
            </button>
          }
        />
        <div className="table-card">
          {loading && <div className="empty-card">Loading sessions…</div>}
          {!loading && sessions.length === 0 && (
            <div className="empty-card">No sessions yet. Start one from the Session tab.</div>
          )}
          {sessions.map((s) => (
            <article
              className="schedule-row"
              key={s.run_id}
              style={{ cursor: "pointer", background: selected === s.run_id ? "var(--primary-soft)" : undefined }}
              onClick={() => openSession(s.run_id)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: statusColor(s.status), flexShrink: 0
                    }}
                  />
                  {shortId(s.run_id)}
                  <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 12 }}>
                    · {s.agent_id}
                  </span>
                </h3>
                <small style={{ color: "var(--muted)" }}>
                  <Clock size={11} style={{ verticalAlign: "middle", marginRight: 3 }} />
                  {relTime(s.started_at)} · {s.step_count} step{s.step_count !== 1 ? "s" : ""} · {s.last_step}
                </small>
              </div>
              <ChevronRight size={16} color="var(--subtle)" />
            </article>
          ))}
        </div>
      </section>

      <aside className="form-panel" style={{ overflowY: "auto" }}>
        {!selected && (
          <div style={{ color: "var(--muted)", fontSize: 14, marginTop: 24 }}>
            <Files size={28} style={{ marginBottom: 10, display: "block", color: "var(--subtle)" }} />
            Select a session on the left to view its step timeline.
          </div>
        )}
        {selected && (
          <>
            <h2 style={{ marginBottom: 14 }}>Steps · {shortId(selected)}</h2>
            {loadingSteps && <div className="empty-card">Loading steps…</div>}
            {!loadingSteps && steps.length === 0 && <div className="empty-card">No steps recorded.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {steps.map((step, i) => (
                <div
                  key={step.id}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "10px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    background: "var(--panel)",
                    fontSize: 13
                  }}
                >
                  <span
                    style={{
                      width: 22, height: 22, borderRadius: "50%",
                      background: "var(--primary-soft)", color: "var(--primary)",
                      display: "grid", placeItems: "center",
                      fontWeight: 700, fontSize: 11, flexShrink: 0
                    }}
                  >
                    {i + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{step.step}</div>
                    <div style={{ color: statusColor(step.status), fontSize: 11, marginTop: 2 }}>
                      {step.status}
                    </div>
                  </div>
                  <div style={{ color: "var(--subtle)", fontSize: 11, whiteSpace: "nowrap" }}>
                    {relTime(step.created_at)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
