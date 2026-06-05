import { FormEvent, useEffect, useState } from "react";
import { Check, History, Megaphone, ShieldCheck, Sparkles } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
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
      await api.generateMarketingCampaign(id);
      await load();
    } finally {
      setBusy(undefined);
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

  async function verifyFinding(id: number) {
    setBusy(id);
    try {
      await api.verifySecurityFinding(id);
      await load();
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

      <section className="finding-inbox">
        <div className="finding-inbox-head">
          <div><span>CommitGuard handoff</span><h2>Security findings</h2><p>Only verified findings can become campaign evidence.</p></div>
          <strong>{findings.filter((finding) => finding.status === "verified").length} verified</strong>
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
                  <button className="primary-button" onClick={() => useFinding(finding)}><Megaphone size={14} />Use finding</button>
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
                <button className="secondary-button" disabled={busy === campaign.id} onClick={() => void generate(campaign.id)}>
                  <Sparkles size={14} />{campaign.body ? "Regenerate draft" : "Generate draft"}
                </button>
                {campaign.status === "review_required" && (
                  <button className="primary-button" disabled={busy === campaign.id} onClick={() => void approve(campaign.id)}>
                    <Check size={14} />Approve draft
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
