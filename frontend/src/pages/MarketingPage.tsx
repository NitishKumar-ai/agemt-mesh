import { FormEvent, useEffect, useState } from "react";
import { CalendarClock, Check, History, Loader2, Megaphone, Radio, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { CampaignWarRoom } from "../components/CampaignWarRoom";
import { api } from "../lib/api";
import type { MarketingAuditEvent, MarketingCampaign, SecurityFinding } from "../lib/types";

type CampaignForm = {
  name: string;
  audience: string;
  finding_summary: string;
  value_proposition: string;
  channel: string;
  source_finding_id?: number;
};

const emptyForm: CampaignForm = {
  name: "",
  audience: "",
  finding_summary: "",
  value_proposition: "",
  channel: "email"
};

export function MarketingPage() {
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [findings, setFindings] = useState<SecurityFinding[]>([]);
  const [auditEvents, setAuditEvents] = useState<MarketingAuditEvent[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState<number>();
  // Track which campaigns have a pipeline running (workflow_id → campaign_id)
  const [pipelines, setPipelines] = useState<Record<number, string>>({});
  // Autonomous commit-to-campaign run: the active War Room (workflow_id + mode)
  const [activeRun, setActiveRun] = useState<{ runId: string; goLive: boolean } | null>(null);
  const [goLive, setGoLive] = useState(false);

  async function load() {
    const [campaignResponse, findingResponse, auditResponse] = await Promise.all([
      api.listMarketingCampaigns(),
      api.listSecurityFindings(),
      api.listMarketingAuditEvents()
    ]);
    setCampaigns(campaignResponse.campaigns);
    setFindings(findingResponse.findings);
    setAuditEvents(auditResponse.events);
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!form.source_finding_id || !form.name.trim() || !form.audience.trim() || !form.finding_summary.trim()) return;
    await api.createMarketingCampaign(form);
    setForm(emptyForm);
    await load();
  }

  async function generate(id: number) {
    setBusy(id);
    try {
      // Kicks off the Research → Write pipeline; poll until draft lands in DB
      const res = await api.generateMarketingCampaign(id);
      setPipelines((prev) => ({ ...prev, [id]: res.workflow_id }));
      // Poll every 3s for up to 90s for the draft to appear
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const updated = await api.listMarketingCampaigns();
        const campaign = updated.campaigns.find((c) => c.id === id);
        if (campaign?.subject) {
          setCampaigns(updated.campaigns);
          break;
        }
      }
    } finally {
      setBusy(undefined);
      setPipelines((prev) => { const n = { ...prev }; delete n[id]; return n; });
    }
  }

  async function approve(id: number) {
    setBusy(id);
    try {
      await api.approveMarketingCampaign(id, "Approved in Agent Mesh marketing workspace");
      await load();
    } finally {
      setBusy(undefined);
    }
  }

  async function schedule(id: number) {
    setBusy(id);
    try {
      await api.scheduleMarketingCampaign(id);
      await load();
    } finally {
      setBusy(undefined);
    }
  }

  async function verifyFinding(id: number) {
    setBusy(id);
    try {
      await api.verifySecurityFinding(id);
      await load();
    } finally {
      setBusy(undefined);
    }
  }

  async function runCampaign(id: number) {
    setBusy(id);
    try {
      const res = await api.commitFindingToCampaign(id, goLive);
      setActiveRun({ runId: res.workflow_id, goLive: res.go_live });
    } finally {
      setBusy(undefined);
    }
  }

  function useFinding(finding: SecurityFinding) {
    setForm({
      name: `${finding.title} campaign`,
      audience: "",
      finding_summary: finding.summary,
      value_proposition: "Provide an evidence-backed security review and remediation plan.",
      channel: "email",
      source_finding_id: finding.id
    });
  }

  return (
    <div className="page marketing-page">
      <PageHeader
        eyebrow="Marketing arm"
        title="Evidence-backed campaigns"
        description="Turn verified security findings into responsible outreach drafts. Nothing is sent automatically."
      />

      {activeRun && (
        <CampaignWarRoom
          runId={activeRun.runId}
          goLive={activeRun.goLive}
          onClose={() => setActiveRun(null)}
          onDone={() => void load()}
        />
      )}

      <section className="finding-inbox">
        <div className="finding-inbox-head">
          <div><span>CommitGuard handoff</span><h2>Security findings</h2><p>Verified findings launch an autonomous campaign — researched, drafted, compliance-checked, then one approval click to publish.</p></div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button
              type="button"
              onClick={() => setGoLive(!goLive)}
              title={goLive ? "Live: approved campaigns post to real platforms" : "Dry-run: full pipeline, no real post"}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 9999, cursor: "pointer", border: `1px solid ${goLive ? "var(--error)" : "var(--hairline)"}`, background: goLive ? "color-mix(in srgb, var(--error) 8%, transparent)" : "var(--canvas)", color: goLive ? "var(--error)" : "var(--muted)", fontWeight: 600, fontSize: 13 }}
            >
              <Radio size={14} />{goLive ? "Go Live: ON" : "Go Live: OFF (dry-run)"}
            </button>
            <strong>{findings.filter((finding) => finding.status === "verified").length} verified</strong>
          </div>
        </div>
        <div className="finding-list">
          {findings.length === 0 && <div className="empty-card">No findings have been handed off from CommitGuard yet.</div>}
          {findings.map((finding) => (
            <article key={finding.id}>
              <div className={`finding-severity finding-severity--${finding.severity}`}>{finding.severity}</div>
              <div className="finding-copy">
                <span>{finding.repository || finding.source_agent}</span>
                <h3>{finding.title}</h3>
                <p>{finding.summary}</p>
                <details><summary>View evidence</summary><p>{finding.evidence}</p></details>
              </div>
              <div className="finding-actions">
                {finding.status === "review_required" ? (
                  <button className="secondary-button" disabled={busy === finding.id} onClick={() => void verifyFinding(finding.id)}><ShieldCheck size={14} />Verify</button>
                ) : (
                  <>
                    <button className="primary-button" disabled={busy === finding.id || !!activeRun} onClick={() => void runCampaign(finding.id)}>
                      {busy === finding.id ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Zap size={14} />}
                      Run Campaign
                    </button>
                    <button className="secondary-button" onClick={() => useFinding(finding)}><Megaphone size={14} />Use finding</button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="marketing-layout">
        <section className="campaign-list">
          {campaigns.length === 0 && <div className="empty-card">No campaigns yet. Create one from a verified finding.</div>}
          {campaigns.map((campaign) => (
            <article className="campaign-card" key={campaign.id}>
              <header>
                <div><span>{campaign.channel}</span><h2>{campaign.name}</h2><p>{campaign.audience}</p></div>
                <strong className={`campaign-status campaign-status--${campaign.status}`}>{campaign.status.replace("_", " ")}</strong>
              </header>
              <div className="campaign-evidence">
                <span>Evidence</span>
                <p>{campaign.finding_summary}</p>
              </div>
              {campaign.subject && (
                <div className="campaign-draft">
                  <span>Subject</span>
                  <h3>{campaign.subject}</h3>
                  <p>{campaign.body}</p>
                </div>
              )}
              <footer>
                {pipelines[campaign.id] ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--primary)", fontSize: 13, fontWeight: 600 }}>
                    <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                    Research &amp; writing in progress…
                  </div>
                ) : (
                  <button className="secondary-button" disabled={busy === campaign.id} onClick={() => void generate(campaign.id)}>
                    <Sparkles size={14} />{campaign.body ? "Regenerate draft" : "Generate draft"}
                  </button>
                )}
                {campaign.status === "review_required" && (
                  <button className="primary-button" disabled={busy === campaign.id} onClick={() => void approve(campaign.id)}>
                    <Check size={14} />Approve draft
                  </button>
                )}
                {campaign.status === "approved" && (
                  <button className="primary-button" disabled={busy === campaign.id} onClick={() => void schedule(campaign.id)}>
                    <CalendarClock size={14} />Schedule via Typefully
                  </button>
                )}
              </footer>
            </article>
          ))}
        </section>

        <aside className="form-panel marketing-form">
          <Megaphone size={21} />
          <h2>New campaign</h2>
          <p>Start with a verified finding, not a scraped prospect list.</p>
          <form onSubmit={create}>
            {form.source_finding_id && <div className="selected-finding"><ShieldCheck size={14} />Using verified finding #{form.source_finding_id}</div>}
            <label>Campaign name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Dependency risk outreach" /></label>
            <label>Audience<input value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value })} placeholder="Engineering leaders at SaaS teams" /></label>
            <label>Verified finding<textarea readOnly value={form.finding_summary} placeholder="Select a verified finding from the inbox above." /></label>
            <label>Value proposition<textarea value={form.value_proposition} onChange={(event) => setForm({ ...form, value_proposition: event.target.value })} placeholder="How your service helps remediate the finding..." /></label>
            <label>Channel<select value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value })}><option value="email">Email</option><option value="linkedin">LinkedIn</option><option value="report">Security report</option></select></label>
            <button className="primary-button" disabled={!form.source_finding_id} type="submit"><Sparkles size={14} />Create campaign</button>
          </form>
        </aside>
      </div>

      <section className="marketing-audit">
        <div className="marketing-audit-head"><History size={16} /><div><h2>Audit trail</h2><p>Append-only record of the marketing handoff and approval lifecycle.</p></div></div>
        <div className="audit-event-list">
          {auditEvents.length === 0 && <div className="empty-card">No marketing audit events yet.</div>}
          {auditEvents.map((event) => (
            <article key={event.id}>
              <i />
              <div><strong>{event.action.replaceAll("_", " ")}</strong><span>{event.actor} · {event.entity_type} #{event.entity_id}</span></div>
              <time>{new Date(event.created_at).toLocaleString()}</time>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
