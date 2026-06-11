import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock, RefreshCw, Shield, ShieldAlert, ShieldCheck, ShieldX, XCircle } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";
import type { SafetyEscalation, SafetyStats, SafetyVerdict } from "../lib/types";

const VERDICT_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  PASS:  { bg: "#E8F5E9", fg: "#2E7D32", border: "#A5D6A7" },
  FLAG:  { bg: "#FFF8E1", fg: "#F57F17", border: "#FFE082" },
  BLOCK: { bg: "#FFEBEE", fg: "#C62828", border: "#EF9A9A" },
};

const RISK_COLORS: Record<string, string> = {
  low: "#2FA76F",
  medium: "#DC8B24",
  high: "#DD4E4E",
  critical: "#9C27B0",
};

function VerdictPill({ verdict }: { verdict: string }) {
  const c = VERDICT_COLORS[verdict] || VERDICT_COLORS.FLAG;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 10px", borderRadius: 9999, fontSize: 12, fontWeight: 600,
      background: c.bg, color: c.fg, border: `1px solid ${c.border}`,
    }}>
      {verdict === "PASS" && <CheckCircle2 size={12} />}
      {verdict === "FLAG" && <AlertTriangle size={12} />}
      {verdict === "BLOCK" && <XCircle size={12} />}
      {verdict}
    </span>
  );
}

function RiskPill({ tier }: { tier: string }) {
  const color = RISK_COLORS[tier] || "#777";
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 9999,
      fontSize: 11, fontWeight: 600, color, border: `1px solid ${color}30`,
      background: `${color}12`,
    }}>
      {tier}
    </span>
  );
}

function StatCard({ label, value, sub, icon: Icon }: {
  label: string; value: string | number; sub?: string;
  icon: typeof Shield;
}) {
  return (
    <div style={{
      background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12,
      padding: 20, flex: "1 1 160px", minWidth: 140,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Icon size={16} style={{ color: "var(--muted)" }} />
        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function SafetyPage() {
  const [stats, setStats] = useState<SafetyStats | null>(null);
  const [verdicts, setVerdicts] = useState<SafetyVerdict[]>([]);
  const [escalations, setEscalations] = useState<SafetyEscalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [tab, setTab] = useState<"verdicts" | "escalations">("verdicts");
  const [resolveText, setResolveText] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      const [s, v, e] = await Promise.all([
        api.safetyStats(),
        api.safetyVerdicts(),
        api.safetyEscalations(),
      ]);
      setStats(s);
      setVerdicts(v.verdicts);
      setEscalations(e.escalations);
    } catch { /* empty */ }
    setLoading(false);
  }

  useEffect(() => { void refresh(); }, []);

  async function handleResolve(id: number) {
    if (!resolveText.trim()) return;
    await api.resolveEscalation(id, resolveText);
    setResolveText("");
    void refresh();
  }

  const passRate = stats && stats.total_evaluations > 0
    ? Math.round(((stats.by_verdict["PASS"] || 0) / stats.total_evaluations) * 100)
    : 0;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Track B"
        title="Safety — CriticGate"
        description="Recursive Self-Correction Protocol. Every agent action is evaluated by a trusted Critic before execution."
        actions={
          <button onClick={refresh} className="btn btn--secondary" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <RefreshCw size={14} className={loading ? "spin" : ""} /> Refresh
          </button>
        }
      />

      {/* Stats row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <StatCard icon={Shield} label="Total Evaluations" value={stats?.total_evaluations ?? "—"} />
        <StatCard icon={ShieldCheck} label="Pass Rate" value={`${passRate}%`} sub={`${stats?.by_verdict["PASS"] ?? 0} passed`} />
        <StatCard icon={ShieldAlert} label="Flagged" value={stats?.by_verdict["FLAG"] ?? 0} sub="Escalated for review" />
        <StatCard icon={ShieldX} label="Blocked" value={stats?.by_verdict["BLOCK"] ?? 0} sub={`${stats?.counterfactual_blocks ?? 0} counterfactual`} />
        <StatCard icon={Clock} label="Avg Eval Time" value={`${stats?.avg_eval_duration_ms ?? 0}ms`} sub={`Confidence: ${stats?.avg_confidence ?? 0}`} />
        <StatCard icon={AlertTriangle} label="Open Escalations" value={stats?.open_escalations ?? 0} />
      </div>

      {/* Risk tier breakdown */}
      {stats && Object.keys(stats.by_risk_tier).length > 0 && (
        <div style={{
          background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12,
          padding: 16, marginBottom: 24,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Risk Tier Distribution</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {Object.entries(stats.by_risk_tier).map(([tier, count]) => (
              <div key={tier} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <RiskPill tier={tier} />
                <span style={{ fontSize: 14, fontWeight: 600 }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 16 }}>
        {(["verdicts", "escalations"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 20px", fontSize: 13, fontWeight: 600, border: "1px solid var(--border)",
              borderRadius: 8, cursor: "pointer",
              background: tab === t ? "var(--primary-soft)" : "var(--panel)",
              color: tab === t ? "var(--primary)" : "var(--muted)",
            }}
          >
            {t === "verdicts" ? `Verdicts (${verdicts.length})` : `Escalations (${escalations.length})`}
          </button>
        ))}
      </div>

      {/* Verdicts list */}
      {tab === "verdicts" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {verdicts.length === 0 && !loading && (
            <div style={{ textAlign: "center", padding: 48, color: "var(--muted)", fontSize: 14 }}>
              No critic evaluations yet. Run an agent to see safety verdicts here.
            </div>
          )}
          {verdicts.map((v) => {
            const expanded = expandedId === v.id;
            return (
              <div key={v.id} style={{
                background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12,
                overflow: "hidden",
              }}>
                <button
                  onClick={() => setExpandedId(expanded ? null : v.id)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 12,
                    padding: "14px 16px", background: "none", border: 0, cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {expanded ? <ChevronDown size={14} color="var(--muted)" /> : <ChevronRight size={14} color="var(--muted)" />}
                  <VerdictPill verdict={v.verdict} />
                  <RiskPill tier={v.risk_tier} />
                  <span style={{ flex: 1, fontSize: 13, color: "var(--text)", fontWeight: 500 }}>
                    {v.agent_id}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    {v.confidence.toFixed(2)} confidence
                  </span>
                  <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>
                    {v.eval_duration_ms}ms
                  </span>
                  {v.counterfactual_flag && (
                    <span style={{
                      fontSize: 10, padding: "2px 6px", borderRadius: 4,
                      background: "#F3E5F5", color: "#7B1FA2", fontWeight: 600,
                    }}>
                      COUNTERFACTUAL
                    </span>
                  )}
                </button>
                {expanded && (
                  <div style={{ padding: "0 16px 16px 42px", fontSize: 13 }}>
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ fontWeight: 600, color: "var(--text)" }}>Reasoning: </span>
                      <span style={{ color: "var(--muted)" }}>{v.reasoning}</span>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ fontWeight: 600, color: "var(--text)" }}>Checks: </span>
                      <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
                        {Object.entries(v.checks).map(([k, passed]) => (
                          <span key={k} style={{
                            fontSize: 11, padding: "2px 6px", borderRadius: 4,
                            background: passed ? "#E8F5E9" : "#FFEBEE",
                            color: passed ? "#2E7D32" : "#C62828",
                          }}>
                            {passed ? "✓" : "✗"} {k}
                          </span>
                        ))}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--muted)" }}>
                      <span>Run: <code>{v.run_id.slice(0, 12)}</code></span>
                      <span>Frame: <code>{v.frame_hash}</code></span>
                      <span>Depth: {v.recursion_depth}</span>
                      <span>Model: {v.critic_model}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Escalations list */}
      {tab === "escalations" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {escalations.length === 0 && !loading && (
            <div style={{ textAlign: "center", padding: 48, color: "var(--muted)", fontSize: 14 }}>
              No escalations. Blocked or flagged actions from the Critic will appear here.
            </div>
          )}
          {escalations.map((e) => (
            <div key={e.id} style={{
              background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12,
              padding: 16,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{
                  fontSize: 11, padding: "2px 8px", borderRadius: 9999, fontWeight: 600,
                  background: e.resolved ? "#E8F5E9" : "#FFF8E1",
                  color: e.resolved ? "#2E7D32" : "#F57F17",
                  border: `1px solid ${e.resolved ? "#A5D6A7" : "#FFE082"}`,
                }}>
                  {e.resolved ? "Resolved" : "Open"}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
                  {e.escalation_type}
                </span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  Agent: {e.agent_id}
                </span>
                <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto", fontFamily: "monospace" }}>
                  {e.frame_hash}
                </span>
              </div>
              {e.resolved && e.resolution && (
                <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
                  <span style={{ fontWeight: 600 }}>Resolution:</span> {e.resolution}
                  {e.resolved_by && <span> — by {e.resolved_by}</span>}
                </div>
              )}
              {!e.resolved && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input
                    placeholder="Resolution note…"
                    value={resolveText}
                    onChange={(ev) => setResolveText(ev.target.value)}
                    style={{
                      flex: 1, padding: "6px 10px", fontSize: 13, border: "1px solid var(--border)",
                      borderRadius: 8, background: "var(--bg)",
                    }}
                  />
                  <button
                    onClick={() => handleResolve(e.id)}
                    className="btn btn--primary"
                    style={{ fontSize: 13, padding: "6px 16px" }}
                  >
                    Resolve
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
