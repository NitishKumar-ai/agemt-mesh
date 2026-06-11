import { useEffect, useState } from "react";
import { Bot, Play, RefreshCw, Search, Shield, Terminal, Zap } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";
import type { AgentInfo } from "../lib/types";

const ICONS: Record<string, typeof Bot> = {
  commitguard: Shield,
  marketing: Zap,
  scheduler: Terminal,
  selfheal: Bot,
  research: Search,
};

function statusDot(status: string) {
  const color =
    status === "running" ? "var(--primary)" :
    status === "error" ? "var(--error)" :
    "var(--success)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      {status}
    </span>
  );
}

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [runTarget, setRunTarget] = useState<string | null>(null);
  const [goal, setGoal] = useState("");
  const [context, setContext] = useState("");
  const [launching, setLaunching] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await api.listAgents();
      setAgents(res.agents);
    } finally {
      setLoading(false);
    }
  }

  async function launchAgent() {
    if (!runTarget || !goal) return;
    setLaunching(true);
    try {
      await api.runAgent(runTarget, goal, context);
      setRunTarget(null);
      setGoal("");
      setContext("");
      void load();
    } finally {
      setLaunching(false);
    }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!runTarget) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRunTarget(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [runTarget]);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Roster"
        title="Agents"
        description="Active agents with their models, capabilities, sandbox policies, and current status."
        actions={
          <button className="secondary-button" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      {loading && <div className="empty-card">Loading agents…</div>}

      {!loading && agents.length === 0 && (
        <div className="empty-card">No agents registered.</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        {agents.map((agent) => {
          const Icon = ICONS[agent.id] ?? Bot;
          return (
            <article
              key={agent.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                background: "var(--panel)",
                padding: "20px 22px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: "var(--primary-soft)", color: "var(--primary)",
                    display: "grid", placeItems: "center"
                  }}>
                    <Icon size={18} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{agent.name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{agent.id}</div>
                  </div>
                </div>
                {statusDot(agent.status)}
              </div>

              <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.45 }}>
                {agent.description}
              </p>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {agent.capabilities.map((cap) => (
                  <span
                    key={cap}
                    style={{
                      padding: "2px 8px", borderRadius: 6, fontSize: 11,
                      fontWeight: 600, background: "var(--panel-soft)",
                      color: "var(--muted)", border: "1px solid var(--border)"
                    }}
                  >
                    {cap.replace(/_/g, " ")}
                  </span>
                ))}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 12, color: "var(--muted)", borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 2 }}>
                <div>
                  <span style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 10 }}>Model</span>
                  <div style={{ color: "var(--primary)", fontWeight: 600, marginTop: 2 }}>{agent.model}</div>
                </div>
                <div>
                  <span style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 10 }}>Sandbox</span>
                  <div style={{ fontWeight: 600, marginTop: 2, color: agent.sandbox ? "var(--success)" : "var(--subtle)" }}>
                    {agent.sandbox ?? "none"}
                  </div>
                </div>
                <button
                  style={{
                    marginLeft: "auto", display: "flex", alignItems: "center", gap: 4,
                    padding: "5px 12px", borderRadius: 8, border: "1px solid var(--primary)",
                    background: "var(--primary-soft)", color: "var(--primary)",
                    fontWeight: 700, fontSize: 11, cursor: "pointer",
                  }}
                  onClick={() => setRunTarget(agent.id)}
                >
                  <Play size={12} /> Run
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {runTarget && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          display: "grid", placeItems: "center", zIndex: 100,
        }} onClick={() => setRunTarget(null)}>
          <div
            style={{
              background: "var(--bg)", borderRadius: 16, padding: 28,
              width: 420, maxWidth: "90vw", border: "1px solid var(--border)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: 16 }}>
              Run {agents.find((a) => a.id === runTarget)?.name ?? runTarget}
            </h2>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4, color: "var(--muted)" }}>
              Goal
            </label>
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What should the agent accomplish?"
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 8,
                border: "1px solid var(--border)", fontSize: 13,
                background: "var(--panel)", marginBottom: 12,
              }}
            />
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4, color: "var(--muted)" }}>
              Context (optional)
            </label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Additional context, URLs, parameters…"
              rows={3}
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 8,
                border: "1px solid var(--border)", fontSize: 13,
                background: "var(--panel)", marginBottom: 16, resize: "vertical",
              }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="secondary-button" onClick={() => setRunTarget(null)}>
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={!goal || launching}
                onClick={launchAgent}
              >
                {launching ? "Launching…" : "Launch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
