import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, X } from "lucide-react";
import { connectEventStream } from "../lib/events";
import { api } from "../lib/api";
import type { MeshEvent } from "../lib/types";

/**
 * Live "War Room" for an autonomous commit-to-campaign run.
 * Subscribes to the shared /stream bus, filters events by run_id (== workflow_id),
 * renders the pipeline as a stage DAG, streams each agent line in a dark terminal,
 * and surfaces the single inline approval click.
 */

type StageState = "idle" | "active" | "done" | "blocked" | "failed";

const STAGES: { key: string; label: string }[] = [
  { key: "finding", label: "Finding" },
  { key: "campaign", label: "Campaign" },
  { key: "research", label: "Researcher" },
  { key: "generate", label: "Social Team" },
  { key: "compliance", label: "Compliance" },
  { key: "approval", label: "Approval" },
  { key: "publish", label: "Publisher" },
];

const STATUS_COLOR: Record<StageState, string> = {
  idle: "var(--muted-soft, #9a9a9a)",
  active: "var(--brand-lavender, #b8a4ed)",
  done: "var(--success, #22c55e)",
  blocked: "var(--warning, #f59e0b)",
  failed: "var(--error, #ef4444)",
};

// Which stage each event_type drives, and what state it moves it to.
function applyEvent(stages: Record<string, StageState>, ev: MeshEvent): Record<string, StageState> {
  const next = { ...stages };
  const set = (k: string, s: StageState) => { next[k] = s; };
  switch (ev.eventType) {
    case "commit_started": set("finding", "done"); set("research", "active"); break;
    case "campaign_created": set("campaign", "done"); set("research", "active"); break;
    case "research_done": set("research", "done"); set("generate", "active"); break;
    case "dag_agent_status":
    case "draft_ready":
    case "art_ready": set("generate", "active"); break;
    case "compliance_started": set("generate", "done"); set("compliance", "active"); break;
    case "compliance_done": set("compliance", "done"); break;
    case "drafts_persisted": set("compliance", "done"); break;
    case "approval_required": set("compliance", "done"); set("approval", "blocked"); break;
    case "publish_started": set("approval", "done"); set("publish", "active"); break;
    case "publish_done": set("publish", "done"); break;
    case "campaign_done": set("publish", "done"); break;
    case "campaign_rejected":
    case "campaign_timeout": set("approval", "failed"); break;
    case "killswitch_halt": {
      for (const k of Object.keys(next)) if (next[k] === "active") set(k, "failed");
      break;
    }
  }
  return next;
}

function lineText(ev: MeshEvent): string {
  const p = ev.payload as Record<string, any>;
  switch (ev.eventType) {
    case "commit_started": return `Committing finding "${p.finding_title ?? ""}" to a campaign${p.go_live ? " (LIVE)" : " (dry-run)"}…`;
    case "campaign_created": return `Campaign created: ${p.name ?? ""}`;
    case "research_done": return `Research complete — risk ${p.risk_level ?? "?"}, tone ${p.tone ?? "?"}`;
    case "dag_agent_status": return `${p.agent ?? "Agent"}: ${p.message ?? ""}`;
    case "draft_ready": return `Draft ready for ${p.label ?? p.platform} (${p.char_count ?? "?"} chars)`;
    case "art_ready": return `Art Director rendered a visual`;
    case "compliance_started": return `Compliance gate reviewing ${p.count ?? 0} draft(s)…`;
    case "compliance_draft_result": return `${p.platform}: ${p.action}${p.issues?.length ? ` (rules ${p.issues.join(", ")})` : ""}`;
    case "compliance_done": return `Compliance: ${p.passed_count ?? 0} passed, ${p.held_count ?? 0} held`;
    case "drafts_persisted": return `Persisted drafts for ${(p.platforms ?? []).join(", ")}`;
    case "approval_required": return `Awaiting approval — ${p.publishable_count ?? 0} ready, ${p.held_count ?? 0} held`;
    case "publish_started": return `Publishing ${p.count ?? 0} post(s)${p.go_live ? " live" : " (dry-run)"}…`;
    case "publish_platform_result":
      return p.success
        ? `✓ Published to ${p.platform}${p.url ? ` — ${p.url}` : ""}`
        : p.held
          ? `${p.platform}: held by compliance`
          : `${p.platform}: queued — retrying${p.reason ? ` (${p.reason})` : ""}`;
    case "publish_done": return `Publish complete — ${p.published ?? 0} live, ${p.queued ?? 0} queued, ${p.held ?? 0} held`;
    case "campaign_done": return `Campaign committed — ${p.published ?? 0} live, ${p.queued ?? 0} queued`;
    case "campaign_rejected": return `Campaign rejected (${p.reason ?? ""})`;
    case "campaign_timeout": return `Campaign timed out waiting for approval`;
    case "killswitch_halt": return `⛔ Killswitch engaged — campaign halted`;
    default: return `${ev.agentId}: ${ev.eventType}`;
  }
}

const AGENT_COLOR: Record<string, string> = {
  CampaignOrchestrator: "#b8a4ed",
  ResearcherAgent: "#ffb084",
  SocialStudioTeam: "#ff4d8b",
  ComplianceGate: "#e8b94a",
  PublisherAgent: "#a4d4c5",
};

export function CampaignWarRoom({ runId, goLive, onClose, onDone }: {
  runId: string;
  goLive: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [events, setEvents] = useState<MeshEvent[]>([]);
  const [stages, setStages] = useState<Record<string, StageState>>(() => ({
    finding: "done", campaign: "active", research: "idle", generate: "idle",
    compliance: "idle", approval: "idle", publish: "idle",
  }));
  const [approvalId, setApprovalId] = useState<number>();
  const [heldCount, setHeldCount] = useState(0);
  const [publishableCount, setPublishableCount] = useState(0);
  const [deciding, setDeciding] = useState(false);
  const [finished, setFinished] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const disconnect = connectEventStream(
      (ev) => {
        if ((ev.payload as any)?.run_id !== runId) return; // only this campaign's events
        setEvents((prev) => [...prev, ev]);
        setStages((prev) => applyEvent(prev, ev));
        if (ev.eventType === "approval_required") {
          setHeldCount(Number((ev.payload as any).held_count ?? 0));
          setPublishableCount(Number((ev.payload as any).publishable_count ?? 0));
        }
        if (["campaign_done", "campaign_rejected", "campaign_timeout", "killswitch_halt"].includes(ev.eventType)) {
          setFinished(true);
          onDone?.();
        }
      },
      () => {}
    );
    return disconnect;
  }, [runId, onDone]);

  // Resolve the approval row id once the gate opens (Approvals tab feeds the same run_id).
  useEffect(() => {
    if (stages.approval !== "blocked" || approvalId) return;
    let cancelled = false;
    const poll = async () => {
      for (let i = 0; i < 20 && !cancelled; i++) {
        try {
          const res = await api.listApprovals();
          const match = res.approvals.find((a) => a.run_id === runId && a.status === "pending");
          if (match) { setApprovalId(match.id); return; }
        } catch { /* keep polling */ }
        await new Promise((r) => setTimeout(r, 1500));
      }
    };
    void poll();
    return () => { cancelled = true; };
  }, [stages.approval, approvalId, runId]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [events]);

  const decide = async (approved: boolean) => {
    if (!approvalId) return;
    setDeciding(true);
    try {
      await api.decideApproval(approvalId, { run_id: runId, approved, note: approved ? "Approved in War Room" : "Rejected in War Room" });
    } finally {
      setDeciding(false);
    }
  };

  const gateOpen = stages.approval === "blocked" && !finished;

  const headerRight = useMemo(() => {
    if (finished) return <span style={{ color: STATUS_COLOR.done, fontWeight: 600, fontSize: 13 }}>Run complete</span>;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#9a9a9a", fontSize: 13 }}>
        <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Running
      </span>
    );
  }, [finished]);

  return (
    <div style={{
      border: "1px solid var(--hairline)", borderRadius: 24, overflow: "hidden",
      marginBottom: 24, background: "var(--canvas)", boxShadow: "var(--shadow-md, 0 8px 24px rgba(0,0,0,0.08))",
      animation: "fadeIn 250ms cubic-bezier(0.25,0.46,0.45,0.94)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--hairline)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: finished ? STATUS_COLOR.done : "#22c55e", boxShadow: `0 0 8px ${finished ? STATUS_COLOR.done : "#22c55e"}` }} />
          <strong style={{ fontSize: 15 }}>Campaign War Room</strong>
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: goLive ? "var(--error)" : "var(--muted)", border: `1px solid ${goLive ? "var(--error)" : "var(--hairline)"}`, padding: "2px 8px", borderRadius: 9999 }}>
            {goLive ? "Live" : "Dry-run"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {headerRight}
          <button onClick={onClose} aria-label="Close War Room" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--muted)", display: "flex" }}>
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Stage DAG */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "18px 20px", flexWrap: "wrap" }}>
        {STAGES.map((stage, i) => {
          const state = stages[stage.key];
          const color = STATUS_COLOR[state];
          return (
            <div key={stage.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 9999,
                border: `1px solid ${state === "idle" ? "var(--hairline)" : color}`,
                background: state === "idle" ? "var(--canvas)" : `color-mix(in srgb, ${color} 10%, transparent)`,
                transition: "all 250ms",
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, animation: state === "active" ? "pulseGlow 1.2s ease-in-out infinite" : "none" }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: state === "idle" ? "var(--muted)" : "var(--ink)" }}>{stage.label}</span>
                {state === "done" && <CheckCircle2 size={13} style={{ color }} />}
              </div>
              {i < STAGES.length - 1 && <span style={{ color: "var(--hairline)", fontSize: 14 }}>→</span>}
            </div>
          );
        })}
      </div>

      {/* Inline approval gate */}
      {gateOpen && (
        <div style={{ margin: "0 20px 18px", padding: 16, borderRadius: 16, border: "1px solid var(--warning, #f59e0b)", background: "color-mix(in srgb, var(--warning, #f59e0b) 8%, transparent)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <ShieldCheck size={16} style={{ color: "var(--warning, #f59e0b)" }} />
            <strong style={{ fontSize: 14 }}>Approval required — the single human beat</strong>
          </div>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 12px" }}>
            {publishableCount} draft(s) ready to publish{heldCount > 0 ? `, ${heldCount} held by compliance (won't be published)` : ""}.
            {goLive ? " Approving posts to real platforms." : " Dry-run: approving completes the pipeline without a real post."}
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="primary-button" disabled={!approvalId || deciding} onClick={() => void decide(true)}>
              {deciding ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle2 size={14} />}
              Approve &amp; publish
            </button>
            <button className="secondary-button" disabled={!approvalId || deciding} onClick={() => void decide(false)}>
              <X size={14} />Reject
            </button>
            {!approvalId && <span style={{ alignSelf: "center", fontSize: 12, color: "var(--muted)" }}>Locating approval…</span>}
          </div>
        </div>
      )}

      {/* Terminal log */}
      <div ref={logRef} style={{
        maxHeight: 280, overflowY: "auto", padding: "14px 20px",
        background: "linear-gradient(180deg, #0a0a0a, #1a1a1a)",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13, lineHeight: 1.7,
      }}>
        {events.length === 0 && <div style={{ color: "#6a6a6a" }}>Waiting for agents to start…</div>}
        {events.map((ev) => (
          <div key={ev.id} style={{ display: "flex", gap: 10, animation: "fadeIn 200ms ease" }}>
            <span style={{ color: "#555", flexShrink: 0 }}>{ev.time.toLocaleTimeString()}</span>
            <span style={{ color: AGENT_COLOR[ev.agentId] ?? "#cfcfcf" }}>{lineText(ev)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
