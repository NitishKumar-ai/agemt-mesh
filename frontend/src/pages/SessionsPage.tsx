import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Clock, Files, RefreshCw, Search, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";
import type { AgentSession, AgentStep } from "../lib/types";

const STATUS_FILTERS = ["all", "running", "completed", "failed", "blocked"] as const;

function statusColor(status: string) {
  if (status === "success" || status === "completed") return "var(--success)";
  if (status === "failed" || status === "error") return "var(--error)";
  if (status === "running" || status === "executing") return "var(--brand-teal)";
  if (status === "blocked") return "var(--brand-ochre)";
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

function matchesStatus(session: AgentSession, filter: string): boolean {
  if (filter === "all") return true;
  const s = session.status.toLowerCase();
  if (filter === "running") return s === "running" || s === "executing" || s === "planning";
  if (filter === "completed") return s === "success" || s === "completed";
  if (filter === "failed") return s === "failed" || s === "error";
  if (filter === "blocked") return s === "blocked" || s === "approval_required";
  return true;
}

export function SessionsPage() {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSteps, setLoadingSteps] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (!matchesStatus(s, statusFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = `${s.run_id} ${s.agent_id} ${s.last_step}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [sessions, statusFilter, search]);

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

  const filterChipStyle = (active: boolean) => ({
    padding: "5px 14px",
    border: 0,
    borderRadius: 9999,
    fontWeight: 600,
    fontSize: 12,
    cursor: "pointer",
    background: active ? "var(--surface-card)" : "transparent",
    color: active ? "var(--ink)" : "var(--muted)",
    transition: "all 150ms",
  });

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

        {/* Search + Filter chips */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 180px", maxWidth: 280 }}>
            <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sessions…"
              style={{
                width: "100%", padding: "8px 28px 8px 30px", border: "1px solid var(--hairline)",
                borderRadius: 12, fontSize: 13, background: "var(--canvas)", color: "var(--ink)",
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: 0, cursor: "pointer", color: "var(--muted)" }}
              >
                <X size={12} />
              </button>
            )}
          </div>
          {STATUS_FILTERS.map((f) => (
            <button key={f} style={filterChipStyle(statusFilter === f)} onClick={() => setStatusFilter(f)}>
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              {f !== "all" && (
                <span style={{ marginLeft: 4, opacity: 0.7 }}>
                  ({sessions.filter((s) => matchesStatus(s, f)).length})
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="table-card">
          {loading && <div className="empty-card">Loading sessions…</div>}
          {!loading && filtered.length === 0 && (
            <div className="empty-card">
              {sessions.length === 0
                ? "No sessions yet. Start one from the Session tab."
                : "No sessions match your filters."}
            </div>
          )}
          {filtered.map((s) => (
            <article
              className="schedule-row"
              key={s.run_id}
              style={{ cursor: "pointer", background: selected === s.run_id ? "var(--surface-card)" : undefined }}
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
                  <span style={{
                    padding: "2px 8px", borderRadius: 9999, fontSize: 10, fontWeight: 700,
                    background: statusColor(s.status), color: "white"
                  }}>
                    {s.status}
                  </span>
                  <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 12 }}>
                    · {s.agent_id}
                  </span>
                </h3>
                <small style={{ color: "var(--muted)" }}>
                  <Clock size={11} style={{ verticalAlign: "middle", marginRight: 3 }} />
                  {relTime(s.started_at)} · {s.step_count} step{s.step_count !== 1 ? "s" : ""} · {s.last_step}
                </small>
              </div>
              <ChevronRight size={16} color="var(--muted-soft)" />
            </article>
          ))}
        </div>
      </section>

      <aside className="form-panel" style={{ overflowY: "auto" }}>
        {!selected && (
          <div style={{ color: "var(--muted)", fontSize: 14, marginTop: 24 }}>
            <Files size={28} style={{ marginBottom: 10, display: "block", color: "var(--muted-soft)" }} />
            Select a session on the left to view its step timeline.
          </div>
        )}
        {selected && (
          <>
            <h2 style={{ marginBottom: 14 }}>Steps · {shortId(selected)}</h2>
            {loadingSteps && <div className="empty-card">Loading steps…</div>}
            {!loadingSteps && steps.length === 0 && <div className="empty-card">No steps recorded.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {steps.map((step, i) => (
                <div
                  key={step.id}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "12px 14px",
                    border: "1px solid var(--hairline)",
                    borderRadius: 12,
                    background: "var(--canvas)",
                    fontSize: 13
                  }}
                >
                  <span
                    style={{
                      width: 24, height: 24, borderRadius: "50%",
                      background: "rgba(26,58,58,.06)", color: "var(--brand-teal)",
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
                  <div style={{ color: "var(--muted-soft)", fontSize: 11, whiteSpace: "nowrap" }}>
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
