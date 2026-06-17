import { useEffect, useState } from "react";
import { 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp, 
  Clock, 
  History, 
  RefreshCw, 
  ShieldAlert, 
  ShieldCheck, 
  ShieldX, 
  User, 
  XCircle 
} from "lucide-react";
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

function DiffViewer({ diff }: { diff: string }) {
  if (!diff) return null;
  
  const lines = diff.split("\n");
  
  return (
    <div className="diff-viewer" style={{
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: "12px",
      lineHeight: "1.6",
      background: "var(--surface-dark)",
      color: "var(--on-dark-soft)",
      borderRadius: "12px",
      overflow: "hidden",
      border: "1px solid var(--surface-dark-elevated)"
    }}>
      <div style={{ padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--on-dark-soft)", textTransform: "uppercase", letterSpacing: "1px" }}>Unified Diff</span>
      </div>
      <div style={{ overflow: "auto", maxHeight: "400px", padding: "8px 0" }}>
        {lines.map((line, i) => {
          let color = "inherit";
          let bg = "transparent";
          if (line.startsWith("+") && !line.startsWith("+++")) {
            color = "#a4d4c5"; // Mint/Success
            bg = "rgba(164, 212, 197, 0.1)";
          } else if (line.startsWith("-") && !line.startsWith("---")) {
            color = "#ff6b5a"; // Coral/Error
            bg = "rgba(255, 107, 90, 0.1)";
          } else if (line.startsWith("@@")) {
            color = "var(--brand-lavender)";
            bg = "rgba(184, 164, 237, 0.05)";
          } else if (line.startsWith("---") || line.startsWith("+++")) {
            color = "var(--on-dark)";
            bg = "rgba(255, 255, 255, 0.05)";
            line = line.slice(0, 100); // Truncate long header lines
          }

          return (
            <div key={i} style={{ 
              background: bg, 
              color: color, 
              padding: "2px 14px", 
              whiteSpace: "pre",
              borderLeft: line.startsWith("+") ? "2px solid #a4d4c5" : line.startsWith("-") ? "2px solid #ff6b5a" : "2px solid transparent"
            }}>
              {line || " "}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ApprovalsPage({ events }: { events?: any[] }) {
  const [approvals, setApprovals] = useState<ApprovalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [deciding, setDeciding] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<{ id: number; action: "approve" | "reject" } | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});

  async function load() {
    setLoading(true);
    try {
      const res = await api.listApprovals();
      // Sort: Pending first, then by risk (high to low), then by age (newest first)
      const sorted = res.approvals.sort((a, b) => {
        if (a.status === "pending" && b.status !== "pending") return -1;
        if (a.status !== "pending" && b.status === "pending") return 1;
        
        const risks = { critical: 4, high: 3, medium: 2, low: 1 };
        const riskA = risks[a.risk_level] || 0;
        const riskB = risks[b.risk_level] || 0;
        if (riskA !== riskB) return riskB - riskA;
        
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      setApprovals(sorted);
    } catch (e) {
      console.error("Failed to load approvals", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  // Reload when a new approval event arrives in the live stream
  useEffect(() => {
    const hasNewApproval = events?.some(e => e.eventType === "approval_required");
    if (hasNewApproval) {
      void load();
    }
  }, [events]);

  const toggleExpand = async (id: number) => {
    const next = new Set(expanded);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      // Fetch history if not already present
      const approval = approvals.find(a => a.id === id);
      if (approval && !approval.history) {
        try {
          const res = await api.getApprovalHistory(id);
          setApprovals(prev => prev.map(a => a.id === id ? { ...a, history: res.history } : a));
        } catch (e) {
          console.error("Failed to fetch history", e);
        }
      }
    }
    setExpanded(next);
  };

  const onDecide = async (approval: ApprovalEvent, approved: boolean) => {
    setDeciding(approval.id);
    try {
      await api.decideApproval(approval.id, {
        run_id: approval.run_id,
        approved,
        note: notes[approval.id] || ""
      });
      // Optimistic update status
      setApprovals(prev => prev.map(a => a.id === approval.id ? { ...a, status: approved ? "approved" : "rejected" } : a));
      setConfirming(null);
      // Reload history for this item
      const res = await api.getApprovalHistory(approval.id);
      setApprovals(prev => prev.map(a => a.id === approval.id ? { ...a, history: res.history } : a));
    } catch (e) {
      alert(`Decision failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeciding(null);
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Human-in-the-loop"
        title="Approvals Queue"
        description="Review and sign off on sensitive agent actions. Items expire automatically after 24 hours if no decision is made."
        actions={
          <button className="secondary-button" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        }
      />

      {loading && <div className="empty-card">Loading approval queue…</div>}

      {!loading && approvals.length === 0 && (
        <div className="empty-card" style={{ padding: "60px 20px" }}>
          <ShieldCheck size={40} style={{ marginBottom: 16, color: "var(--brand-mint)" }} />
          <h3 className="title-sm">All clear</h3>
          <p className="body-sm" style={{ color: "var(--muted)" }}>No pending approvals required at this time.</p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: "1000px" }}>
        {approvals.map((approval) => {
          const isExpanded = expanded.has(approval.id);
          const isPending = approval.status === "pending";
          const isExpired = approval.status === "expired";
          const isApproved = approval.status === "approved";
          const isRejected = approval.status === "rejected";
          
          const riskColor = 
            approval.risk_level === "critical" || approval.risk_level === "high" ? "var(--brand-coral)" :
            approval.risk_level === "medium" ? "var(--brand-ochre)" : "var(--brand-mint)";
          
          const payload = approval.payload;
          const diffStr = (payload.diff as string) || "";
          const reason = (payload.reason as string) || "No reason provided";
          const agentId = approval.requesting_agent;

          return (
            <article
              key={approval.id}
              className={`approval-card ${isExpanded ? "expanded" : ""}`}
              style={{
                border: "1px solid var(--hairline)",
                borderRadius: "20px",
                background: "var(--canvas)",
                boxShadow: isExpanded ? "var(--shadow-md)" : "none",
                transition: "all 300ms var(--ease)",
                overflow: "hidden",
                opacity: isExpired ? 0.7 : 1
              }}
            >
              <div 
                style={{ padding: "20px 24px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                onClick={() => toggleExpand(approval.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1 }}>
                  <div style={{ 
                    width: "40px", height: "40px", borderRadius: "12px", 
                    background: isPending ? "var(--surface-soft)" : isApproved ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                    display: "grid", placeItems: "center", color: isPending ? "var(--muted)" : isApproved ? "var(--success)" : "var(--error)"
                  }}>
                    {isPending ? <ShieldAlert size={20} /> : isApproved ? <ShieldCheck size={20} /> : <ShieldX size={20} />}
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span className="title-sm" style={{ color: "var(--ink)" }}>{reason}</span>
                      <span className="badge" style={{ 
                        background: riskColor, color: "white", border: "none", fontSize: "10px", padding: "2px 8px" 
                      }}>
                        {approval.risk_level} risk
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--muted)", fontSize: "12px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <User size={12} /> {agentId}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <Clock size={12} /> {relTime(approval.created_at)}
                      </span>
                      <span>Workflow: {shortId(approval.run_id)}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  {isExpired && <span className="badge badge--error">Expired</span>}
                  {isApproved && <span className="badge badge--success">Approved</span>}
                  {isRejected && <span className="badge badge--error">Rejected</span>}
                  {isExpanded ? <ChevronUp size={20} color="var(--muted-soft)" /> : <ChevronDown size={20} color="var(--muted-soft)" />}
                </div>
              </div>

              {isExpanded && (
                <div style={{ padding: "0 24px 24px", borderTop: "1px solid var(--hairline-soft)", marginTop: "0" }}>
                  <div style={{ marginTop: "20px" }}>
                    <h4 className="caption-upper" style={{ marginBottom: "12px", color: "var(--muted)" }}>Action Payload</h4>
                    
                    {diffStr ? (
                      <DiffViewer diff={diffStr} />
                    ) : (
                      <pre style={{ 
                        background: "var(--surface-card)", padding: "16px", borderRadius: "12px", 
                        fontSize: "12px", color: "var(--body)", overflow: "auto", maxHeight: "300px" 
                      }}>
                        {JSON.stringify(payload, null, 2)}
                      </pre>
                    )}
                  </div>

                  {/* Audit History */}
                  <div style={{ marginTop: "24px" }}>
                    <h4 className="caption-upper" style={{ marginBottom: "12px", color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
                      <History size={14} /> Audit History
                    </h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", gap: 12, fontSize: "13px", color: "var(--muted)", padding: "8px 0", borderBottom: "1px solid var(--hairline-soft)" }}>
                        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--brand-ochre)", marginTop: "4px" }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <strong>Approval Requested</strong>
                            <time>{new Date(approval.created_at).toLocaleString()}</time>
                          </div>
                          <p style={{ marginTop: "4px" }}>Agent {agentId} requested human sign-off for this action.</p>
                        </div>
                      </div>
                      
                      {approval.history?.map((h, i) => (
                        <div key={i} style={{ display: "flex", gap: 12, fontSize: "13px", color: "var(--muted)", padding: "8px 0", borderBottom: i === (approval.history?.length || 0) - 1 ? "none" : "1px solid var(--hairline-soft)" }}>
                          <div style={{ 
                            width: "8px", height: "8px", borderRadius: "50%", 
                            background: h.action === "approved" ? "var(--success)" : "var(--error)", 
                            marginTop: "4px" 
                          }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <strong style={{ textTransform: "capitalize" }}>{h.action}</strong>
                              <time>{new Date(h.created_at).toLocaleString()}</time>
                            </div>
                            <p style={{ marginTop: "4px" }}>By {h.actor}. {typeof h.payload?.note === "string" && <span>Note: "{h.payload.note}"</span>}</p>
                          </div>
                        </div>
                      ))}

                      {isExpired && !approval.history?.some(h => h.action === "expired") && (
                        <div style={{ display: "flex", gap: 12, fontSize: "13px", color: "var(--muted)", padding: "8px 0" }}>
                          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--error)", marginTop: "4px" }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <strong>Automatically Expired</strong>
                              <time>{new Date(new Date(approval.created_at).getTime() + 86400000).toLocaleString()}</time>
                            </div>
                            <p style={{ marginTop: "4px" }}>System auto-rejected this request after 24h timeout.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Decisions */}
                  {isPending && (
                    <div style={{ marginTop: "32px", padding: "20px", background: "var(--surface-soft)", borderRadius: "16px" }}>
                      {confirming?.id === approval.id ? (
                        <div style={{ animation: "fadeIn 200ms ease" }}>
                          <p className="body-sm" style={{ marginBottom: "16px", fontWeight: 600 }}>
                            Are you sure you want to {confirming.action === "approve" ? "approve" : "reject"} this action?
                          </p>
                          <div style={{ marginBottom: "16px" }}>
                            <label className="caption-upper" style={{ display: "block", marginBottom: "8px", fontSize: "10px" }}>Decision Note (Optional)</label>
                            <textarea 
                              className="body-sm"
                              placeholder="Add a reason for your decision..."
                              value={notes[approval.id] || ""}
                              onChange={(e) => setNotes({ ...notes, [approval.id]: e.target.value })}
                              style={{ 
                                width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid var(--hairline)",
                                minHeight: "80px", background: "var(--canvas)"
                              }}
                            />
                          </div>
                          <div style={{ display: "flex", gap: 12 }}>
                            <button 
                              className="primary-button" 
                              style={{ 
                                flex: 1, 
                                background: confirming.action === "approve" ? "var(--primary)" : "var(--brand-coral)" 
                              }}
                              disabled={!!deciding}
                              onClick={() => onDecide(approval, confirming.action === "approve")}
                            >
                              {deciding === approval.id ? "Processing..." : `Confirm ${confirming.action}`}
                            </button>
                            <button 
                              className="secondary-button" 
                              style={{ flex: 1 }}
                              disabled={!!deciding}
                              onClick={() => setConfirming(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 12 }}>
                          <button 
                            className="primary-button" 
                            style={{ flex: 1 }}
                            onClick={() => setConfirming({ id: approval.id, action: "approve" })}
                          >
                            <ShieldCheck size={16} /> Approve Action
                          </button>
                          <button 
                            className="secondary-button" 
                            style={{ flex: 1, color: "var(--brand-coral)", borderColor: "var(--brand-coral)" }}
                            onClick={() => setConfirming({ id: approval.id, action: "reject" })}
                          >
                            <ShieldX size={16} /> Reject Action
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
