import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Radio, Search, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { eventBody, eventTitle, shortTime } from "../lib/format";
import type { MeshEvent } from "../lib/types";

const AGENT_FILTERS = ["all", "CommitGuardAgent", "SchedulerAgent", "SelfHealAgent", "MarketingAgent"] as const;
const TYPE_FILTERS = ["all", "plan", "execute", "review", "approval", "error", "scan"] as const;

export function ActivityPage({ events, streamState }: { events: MeshEvent[]; streamState: string }) {
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return events.filter((event) => {
      if (agentFilter !== "all" && event.agentId !== agentFilter) return false;
      if (typeFilter !== "all" && !event.eventType.toLowerCase().includes(typeFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = `${event.eventType} ${event.agentId} ${JSON.stringify(event.payload)}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [events, search, agentFilter, typeFilter]);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Live stream"
        title="Activity"
        description="Real-time event stream from agents, workflows, approvals, and scheduled tasks."
        actions={<span className={`stream-pill stream-pill--${streamState}`}><Radio size={14} />{streamState}</span>}
      />

      {/* Search + Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 360 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events…"
            style={{
              width: "100%", padding: "8px 32px 8px 30px", border: "1px solid var(--border)",
              borderRadius: 8, fontSize: 13, background: "var(--panel)"
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: 0, cursor: "pointer", color: "var(--muted)" }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          style={{ padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, background: "var(--panel)" }}
        >
          {AGENT_FILTERS.map((a) => <option key={a} value={a}>{a === "all" ? "All agents" : a.replace("Agent", "")}</option>)}
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{ padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, background: "var(--panel)" }}
        >
          {TYPE_FILTERS.map((t) => <option key={t} value={t}>{t === "all" ? "All types" : t}</option>)}
        </select>

        <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: "auto" }}>
          {filtered.length} event{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Event list */}
      <div className="activity-list">
        {filtered.length === 0 && (
          <div className="empty-card">
            {events.length === 0
              ? "No streamed events yet. Start a session to watch activity here."
              : "No events match your filters."}
          </div>
        )}
        {filtered.map((event) => {
          const isExpanded = expandedId === event.id;
          return (
            <article
              className="activity-row"
              key={event.id}
              style={{ cursor: "pointer" }}
              onClick={() => setExpandedId(isExpanded ? null : event.id)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {isExpanded ? <ChevronDown size={13} color="var(--muted)" /> : <ChevronRight size={13} color="var(--muted)" />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{eventTitle(event)}</strong>
                  <span>{event.agentId} · {shortTime(event.time)}</span>
                </div>
              </div>
              {!isExpanded && (
                <pre style={{ margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                  {eventBody(event)}
                </pre>
              )}
              {isExpanded && (
                <pre style={{
                  margin: "8px 0 0", padding: "12px 14px", background: "var(--panel-soft)",
                  borderRadius: 8, fontSize: 12, overflow: "auto", maxHeight: 300,
                  whiteSpace: "pre-wrap", wordBreak: "break-word"
                }}>
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
