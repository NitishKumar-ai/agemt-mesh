import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, ShieldAlert, XCircle } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";
import type { ApprovalEvent } from "../lib/types";

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function shortId(id: string) {
  return id.length > 12 ? id.slice(0, 8) + "…" : id;
}

function diffLine(line: string) {
  if (line.startsWith("+")) return { color: "var(--success)", bg: "rgba(34,197,94,.05)" };
  if (line.startsWith("-")) return { color: "var(--error)", bg: "rgba(239,68,68,.04)" };
  return { color: "var(--ink)", bg: "transparent" };
}

export function ApprovalsPage({ events }: { events?: { eventType: string; payload: Record<string, unknown> }[] }) {
  const [approvals, setApprovals] = useState<ApprovalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState<number | null>(null);
  const [decided, setDecided] = useState<Set<number>>(new Set());

  async function load() {
    setLoading(true);
    try {
      const res = await api.listApprovals();
      setApprovals(res.approvals);
    } finally {
      setLoading(false);
    }
  }

  async function decide(approval: ApprovalEvent, approved: boolean) {
    setDeciding(approval.id);
    try {
      await api.approveWorkflow(approval.run_id, approved);
      setDecided((prev) => new Set([...prev, approval.id]));
    } finally {
      setDeciding(null);
    }
  }

  useEffect(() => { void load(); }, []);

  // Also surface live approval_required events from the SSE stream
  const liveIds = new Set(approvals.map((a) => a.id));
  const liveApprovals: ApprovalEvent[] = (events ?? [])
    .filter((e) => e.eventType === "approval_required")
    .map((e, i) => ({
      id: -(i + 1),
      run_id: (e.payload.workflow_id as string) ?? "",
      payload: e.payload,
      created_at: new Date().toISOString(),
    }))
    .filter((e) => e.run_id && !liveIds.has(e.id));

  const all = [...liveApprovals, ...approvals];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Human gates"
        title="Approvals"
        description="Pending agent actions that require human sign-off before execution continues."
        actions={
          <button className="secondary-button" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      {loading && <div className="empty-card">Loading approvals…</div>}

      {!loading && all.length === 0 && (
        <div className="empty-card">
          <ShieldAlert size={28} style={{ marginBottom: 8, display: "block", color: "var(--muted-soft)" }} />
          No pending approvals. Agent workflows requiring sign-off will appear here.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {all.map((approval) => {
          const isDone = decided.has(approval.id);
          const diff = (approval.payload?.diff as Record<string, string>) ?? {};
          const riskLevel = (approval.payload?.risk_level as string) ?? "medium";
          const riskColor =
            riskLevel === "high" || riskLevel === "critical" ? "var(--brand-coral)" :
            riskLevel === "medium" ? "var(--brand-ochre)" : "var(--success)";

          return (
            <article
              key={approval.id}
              style={{
                border: "1px solid var(--hairline)",
                borderRadius: 16,
                background: "var(--canvas)",
                padding: "18px 20px",
                opacity: isDone ? 0.55 : 1,
                transition: "all 250ms",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <ShieldAlert size={16} color={riskColor} />
                  <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-0.2px" }}>
                    Workflow {shortId(approval.run_id)}
                  </span>
                  <span
                    style={{
                      padding: "3px 10px", borderRadius: 9999, fontSize: 11,
                      fontWeight: 700, background: riskColor, color: "white"
                    }}
                  >
                    {riskLevel}
                  </span>
                </div>
                <span style={{ color: "var(--muted-soft)", fontSize: 12 }}>{relTime(approval.created_at)}</span>
              </div>

              {/* Diff viewer */}
              {(diff.add || diff.sub) && (
                <div
                  style={{
                    borderRadius: 12, overflow: "hidden", border: "1px solid var(--hairline)",
                    fontFamily: "monospace", fontSize: 12, marginBottom: 14
                  }}
                >
                  {[diff.sub, diff.add].filter(Boolean).map((line, i) => {
                    if (!line) return null;
                    const { color, bg } = diffLine(line);
                    return (
                      <div key={i} style={{ background: bg, color, padding: "5px 14px", whiteSpace: "pre-wrap" }}>
                        {line}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Raw payload if no structured diff */}
              {!diff.add && !diff.sub && (
                <pre
                  style={{
                    background: "var(--surface-card)", borderRadius: 12,
                    padding: "12px 14px", fontSize: 12, overflow: "auto",
                    maxHeight: 160, marginBottom: 14, color: "var(--body)"
                  }}
                >
                  {JSON.stringify(approval.payload, null, 2)}
                </pre>
              )}

              {isDone ? (
                <div style={{ color: "var(--success)", fontWeight: 600, fontSize: 13 }}>
                  <CheckCircle2 size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                  Decision sent
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="primary-button"
                    style={{ flex: 1 }}
                    disabled={deciding === approval.id}
                    onClick={() => decide(approval, true)}
                  >
                    <CheckCircle2 size={14} /> Approve
                  </button>
                  <button
                    className="secondary-button"
                    style={{ flex: 1, color: "var(--brand-coral)", borderColor: "var(--brand-coral)" }}
                    disabled={deciding === approval.id}
                    onClick={() => decide(approval, false)}
                  >
                    <XCircle size={14} /> Reject
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
