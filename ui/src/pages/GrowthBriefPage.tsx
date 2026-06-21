import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  CircleDollarSign,
  GitCompareArrows,
  Lock,
  ListChecks,
  MessageSquareQuote,
  Quote,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { api } from '../lib/api';

// Local, page-owned shapes for the founder-growth-brief WorkflowOutput. These
// intentionally mirror the backend contract loosely (tolerant of missing
// fields) so the page never hard-fails on a partial brief.
type SectionType = 'markdown' | 'list' | 'table' | 'alert' | 'key_value';

interface BriefSection {
  title: string;
  content: string;
  type: SectionType;
  data?: unknown;
}

interface BriefCitation {
  id: string;
  source_id: string;
  title: string;
  url: string | null;
  exact_text?: string;
  confidence: number;
}

interface WorkflowOutput {
  workflow_id: string;
  tenant_id: string;
  scope: string;
  generated_at: string;
  sections: BriefSection[];
  citations: BriefCitation[];
  confidence: number;
  warnings: string[];
  correction_url: string;
}

interface ChannelFunnelRow {
  channel: string;
  signups: number;
  activated: number;
  paid: number;
  spend: number;
  activationRate: number;
  paidRate: number;
  costPerPaid: number | null;
  rank?: number;
  qualityScore?: number;
}

interface Fact {
  id?: string;
  predicate?: string;
  value?: string | number;
  confidence?: number;
  evidence_spans?: string[];
  source_id?: string;
  [key: string]: unknown;
}

const BRIEF_INPUT = {
  campaign: 'campaign-founder-productivity',
  feature: 'feature-investor-update',
  channels: ['channel-producthunt', 'channel-linkedin', 'channel-email', 'channel-twitter'],
} as const;

const SECTION = {
  summary: 'Executive Summary',
  channels: 'Channel Performance',
  feature: 'Feature Performance',
  userResponse: 'User Response',
  revenue: 'Revenue Impact',
  changed: 'What Changed Since the Last Report',
  actions: 'Recommended Next Actions',
} as const;

function confidenceLabel(confidence: number): { label: string; color: string } {
  if (confidence <= 0) return { label: 'Abstained', color: 'var(--error)' };
  if (confidence >= 0.75) return { label: 'High confidence', color: 'var(--success)' };
  if (confidence >= 0.5) return { label: 'Medium confidence', color: 'var(--brand-teal)' };
  return { label: 'Low confidence', color: 'var(--brand-ochre)' };
}

function findSection(brief: WorkflowOutput | null, title: string): BriefSection | undefined {
  return brief?.sections.find((section) => section.title === title);
}

function prettyChannel(raw: string): string {
  return raw
    .replace(/^channel-/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function pct(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

function currency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `$${Math.round(value).toLocaleString()}`;
}

function factLines(data: unknown): Fact[] {
  return Array.isArray(data) ? (data as Fact[]) : [];
}

function factText(fact: Fact): string {
  if (typeof fact.value === 'string' || typeof fact.value === 'number') {
    const predicate = fact.predicate ? `${fact.predicate.replace(/_/g, ' ')}: ` : '';
    return `${predicate}${fact.value}`;
  }
  return fact.predicate ? fact.predicate.replace(/_/g, ' ') : 'Fact';
}

/**
 * Growth Brief — renders the structured founder-growth-brief workflow output as
 * a decision-ready VC/judge demo surface.
 */
export function GrowthBriefPage() {
  const [brief, setBrief] = useState<WorkflowOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBrief = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = (await api.founderGrowthBrief({
        campaign: BRIEF_INPUT.campaign,
        feature: BRIEF_INPUT.feature,
        channels: [...BRIEF_INPUT.channels],
      })) as WorkflowOutput;
      setBrief(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate the growth brief.');
      setBrief(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBrief();
  }, [fetchBrief]);

  const summary = findSection(brief, SECTION.summary);
  const channelSection = findSection(brief, SECTION.channels);
  const featureSection = findSection(brief, SECTION.feature);
  const userResponseSection = findSection(brief, SECTION.userResponse);
  const revenueSection = findSection(brief, SECTION.revenue);
  const changedSection = findSection(brief, SECTION.changed);
  const actionsSection = findSection(brief, SECTION.actions);

  const channels = useMemo<ChannelFunnelRow[]>(
    () => (Array.isArray(channelSection?.data) ? (channelSection?.data as ChannelFunnelRow[]) : []),
    [channelSection],
  );

  // Highest-quality channel: prefer explicit rank 1, else max qualityScore, else
  // best paid-rate. This is the "more signups != better" hero.
  const topChannel = useMemo<ChannelFunnelRow | null>(() => {
    if (channels.length === 0) return null;
    const ranked = channels.find((row) => row.rank === 1);
    if (ranked) return ranked;
    const scored = [...channels].sort(
      (a, b) => (b.qualityScore ?? b.paidRate ?? 0) - (a.qualityScore ?? a.paidRate ?? 0),
    );
    return scored[0] ?? null;
  }, [channels]);

  const mostSignups = useMemo<ChannelFunnelRow | null>(() => {
    if (channels.length === 0) return null;
    return [...channels].sort((a, b) => b.signups - a.signups)[0] ?? null;
  }, [channels]);

  const trust = brief ? confidenceLabel(brief.confidence) : null;

  const revenueRestricted =
    !revenueSection || factLines(revenueSection.data).length === 0;

  const changedData = (changedSection?.data ?? null) as { previous: Fact | null; current: Fact | null } | null;

  return (
    <div className="growth-page">
      <header className="growth-head">
        <div>
          <span className="growth-head__eyebrow">
            <Sparkles size={13} /> Growth Memory · Founder Growth Brief
          </span>
          <h1>Atlas AI — Founder Productivity Campaign</h1>
          <p className="growth-head__sub">
            A cited, permission-aware read on what worked, what changed, and what to do next.
          </p>
        </div>
        <button type="button" className="growth-refresh" onClick={() => void fetchBrief()} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : undefined} /> Regenerate
        </button>
      </header>

      {error && (
        <div className="growth-error" role="alert">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {loading && !brief && (
        <div className="growth-loading">
          <div className="growth-loading__dots"><span /><span /><span /></div>
          <p>Building a permission-safe, cited growth brief…</p>
        </div>
      )}

      {brief && (
        <div className={`growth-body ${loading ? 'is-refreshing' : ''}`}>
          {/* Trust header */}
          {trust && (
            <section className="trust-banner" style={{ borderColor: `color-mix(in srgb, ${trust.color} 35%, var(--hairline))` }}>
              <div className="trust-banner__main">
                <span className="trust-banner__dot" style={{ background: trust.color }} />
                <div>
                  <strong style={{ color: trust.color }}>{trust.label}</strong>
                  <span className="trust-banner__pct">{Math.round(brief.confidence * 100)}% overall confidence</span>
                </div>
              </div>
              <div className="trust-banner__meta">
                <ShieldCheck size={13} /> Scoped to current identity · generated{' '}
                {new Date(brief.generated_at).toLocaleString()}
              </div>
            </section>
          )}

          {brief.warnings.length > 0 && (
            <div className="growth-warnings">
              {brief.warnings.map((warning, index) => (
                <div key={index} className="growth-warnings__item">
                  <AlertTriangle size={13} /> {warning}
                </div>
              ))}
            </div>
          )}

          {/* Executive summary */}
          {summary && (
            <section className="growth-card growth-card--summary">
              <h2 className="growth-card__title"><TrendingUp size={16} /> Executive Summary</h2>
              <p className="growth-summary__prose">{summary.content}</p>
            </section>
          )}

          {/* Channel performance */}
          <section className="growth-card">
            <h2 className="growth-card__title"><TrendingUp size={16} /> Channel Performance</h2>
            {channelSection?.content && <p className="growth-card__lede">{channelSection.content}</p>}
            {channels.length === 0 ? (
              <div className="growth-empty">No channel funnel data is visible to this identity.</div>
            ) : (
              <>
                {topChannel && mostSignups && topChannel.channel !== mostSignups.channel && (
                  <div className="quality-insight">
                    <Trophy size={15} />
                    <span>
                      <strong>{prettyChannel(mostSignups.channel)}</strong> brought the most signups, but{' '}
                      <strong>{prettyChannel(topChannel.channel)}</strong> is the top-quality channel — more signups is
                      not the same as more paying users.
                    </span>
                  </div>
                )}
                <div className="funnel-table" role="table">
                  <div className="funnel-row funnel-row--head" role="row">
                    <span role="columnheader">Channel</span>
                    <span role="columnheader">Signups</span>
                    <span role="columnheader">Activated</span>
                    <span role="columnheader">Paid</span>
                    <span role="columnheader">CAC</span>
                    <span role="columnheader">Quality</span>
                  </div>
                  {channels.map((row) => {
                    const isTop = topChannel?.channel === row.channel;
                    return (
                      <div
                        key={row.channel}
                        className={`funnel-row ${isTop ? 'funnel-row--top' : ''}`}
                        role="row"
                      >
                        <span className="funnel-channel" role="cell">
                          {prettyChannel(row.channel)}
                          {isTop && (
                            <span className="funnel-top-badge">
                              <Trophy size={11} /> Top quality channel
                            </span>
                          )}
                        </span>
                        <span className="funnel-num" role="cell">{row.signups.toLocaleString()}</span>
                        <span className="funnel-bar-cell" role="cell">
                          <span className="funnel-bar-label">{row.activated.toLocaleString()} · {pct(row.activationRate)}</span>
                          <span className="funnel-bar">
                            <span
                              className="funnel-bar__fill funnel-bar__fill--activate"
                              style={{ width: `${Math.min(100, (row.activationRate ?? 0) * 100)}%` }}
                            />
                          </span>
                        </span>
                        <span className="funnel-bar-cell" role="cell">
                          <span className="funnel-bar-label">{row.paid.toLocaleString()} · {pct(row.paidRate)}</span>
                          <span className="funnel-bar">
                            <span
                              className="funnel-bar__fill funnel-bar__fill--paid"
                              style={{ width: `${Math.min(100, (row.paidRate ?? 0) * 100)}%` }}
                            />
                          </span>
                        </span>
                        <span className="funnel-num" role="cell">{currency(row.costPerPaid)}</span>
                        <span className="funnel-quality" role="cell">
                          <QualityBadge score={row.qualityScore} paidRate={row.paidRate} />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          {/* What changed — the temporal moat */}
          <section className="growth-card supersession">
            <h2 className="growth-card__title"><GitCompareArrows size={16} /> What Changed Since the Last Report</h2>
            {changedSection?.content && <p className="growth-card__lede">{changedSection.content}</p>}
            {changedData && (changedData.previous || changedData.current) ? (
              <div className="supersession__cards">
                <div className="supersession__col supersession__col--previous">
                  <span className="supersession__tag">Previously believed</span>
                  {changedData.previous ? (
                    <p className="supersession__value supersession__value--old">{factText(changedData.previous)}</p>
                  ) : (
                    <p className="supersession__value supersession__value--old">No prior reading on record.</p>
                  )}
                </div>
                <div className="supersession__arrow"><ArrowRight size={18} /></div>
                <div className="supersession__col supersession__col--current">
                  <span className="supersession__tag supersession__tag--now">Now</span>
                  {changedData.current ? (
                    <p className="supersession__value supersession__value--new">{factText(changedData.current)}</p>
                  ) : (
                    <p className="supersession__value">No current reading available.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="growth-empty">No supersession recorded for this campaign yet.</div>
            )}
          </section>

          <div className="growth-grid">
            {/* User response */}
            <section className="growth-card">
              <h2 className="growth-card__title"><MessageSquareQuote size={16} /> User Response</h2>
              {userResponseSection?.content && <p className="growth-card__lede">{userResponseSection.content}</p>}
              <FactList facts={factLines(userResponseSection?.data)} emptyLabel="No user-response themes surfaced." />
            </section>

            {/* Revenue impact — permission-gated */}
            <section className={`growth-card ${revenueRestricted ? 'growth-card--restricted' : ''}`}>
              <h2 className="growth-card__title"><CircleDollarSign size={16} /> Revenue Impact</h2>
              {revenueRestricted ? (
                <div className="restricted-state">
                  <Lock size={18} />
                  <strong>Restricted</strong>
                  <p>
                    Revenue figures are not visible to the current identity. Switch to an admin or sales
                    identity above to reveal the revenue impact.
                  </p>
                </div>
              ) : (
                <>
                  {revenueSection?.content && <p className="growth-card__lede">{revenueSection.content}</p>}
                  <FactList facts={factLines(revenueSection?.data)} emptyLabel="No revenue facts available." />
                </>
              )}
            </section>
          </div>

          {/* Feature performance */}
          <section className="growth-card">
            <h2 className="growth-card__title"><BadgeCheck size={16} /> Feature Performance</h2>
            {featureSection?.content && <p className="growth-card__lede">{featureSection.content}</p>}
            <FactList facts={factLines(featureSection?.data)} emptyLabel="No feature performance facts available." />
          </section>

          {/* Recommended actions */}
          <section className="growth-card growth-card--actions">
            <h2 className="growth-card__title"><ListChecks size={16} /> Recommended Next Actions</h2>
            {actionsSection?.content && <p className="growth-card__lede">{actionsSection.content}</p>}
            {factLines(actionsSection?.data).length === 0 ? (
              <div className="growth-empty">No recommended actions for this brief.</div>
            ) : (
              <ul className="action-checklist">
                {factLines(actionsSection?.data).map((fact, index) => (
                  <li key={fact.id ?? index}>
                    <span className="action-check"><CheckCircle2 size={16} /></span>
                    <span className="action-text">{factText(fact)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Citations footer */}
          {brief.citations.length > 0 && (
            <footer className="citations-footer">
              <span className="citations-footer__label"><Quote size={12} /> Sources used</span>
              <div className="citations-footer__list">
                {brief.citations.map((citation, index) => {
                  const inner = (
                    <>
                      <span className="citation-num">{index + 1}</span>
                      <span className="citation-meta">
                        <strong>{citation.title}</strong>
                        <small>{citation.exact_text || citation.source_id}</small>
                      </span>
                    </>
                  );
                  return citation.url ? (
                    <a
                      key={citation.id}
                      className="citation-pill"
                      href={citation.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {inner}
                    </a>
                  ) : (
                    <span key={citation.id} className="citation-pill">{inner}</span>
                  );
                })}
              </div>
              {brief.correction_url && (
                <a className="citations-footer__correct" href={brief.correction_url} target="_blank" rel="noreferrer">
                  Something wrong? Submit a correction
                </a>
              )}
            </footer>
          )}
        </div>
      )}

      <style>{`
        .growth-page {
          display: flex;
          flex-direction: column;
          gap: 18px;
          max-width: 1040px;
          margin: 0 auto;
          width: 100%;
          padding-bottom: 32px;
        }
        .growth-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }
        .growth-head__eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--brand-teal);
        }
        .growth-head h1 { margin: 8px 0 4px; font-size: 26px; letter-spacing: -0.5px; }
        .growth-head__sub { margin: 0; font-size: 13.5px; color: var(--muted); }
        .growth-refresh {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 8px 14px;
          border-radius: 12px;
          border: 1px solid var(--hairline);
          background: var(--surface-card);
          color: var(--ink);
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          white-space: nowrap;
          transition: border-color 0.15s ease, transform 0.15s ease;
        }
        .growth-refresh:hover:not(:disabled) {
          border-color: color-mix(in srgb, var(--brand-teal) 45%, var(--hairline));
          transform: translateY(-1px);
        }
        .growth-refresh:disabled { opacity: 0.55; cursor: default; }
        .spin { animation: gb-spin 0.9s linear infinite; }
        @keyframes gb-spin { to { transform: rotate(360deg); } }

        .growth-error {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: var(--error);
          background: color-mix(in srgb, var(--error) 8%, transparent);
          border: 1px solid color-mix(in srgb, var(--error) 25%, transparent);
          padding: 10px 13px;
          border-radius: 12px;
        }
        .growth-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          padding: 64px 0;
          color: var(--muted);
          font-size: 13.5px;
        }
        .growth-loading__dots { display: inline-flex; gap: 6px; }
        .growth-loading__dots span {
          width: 8px; height: 8px; border-radius: 50%;
          background: var(--brand-teal);
          animation: gb-pulse 1.1s infinite ease-in-out;
        }
        .growth-loading__dots span:nth-child(2) { animation-delay: 0.15s; }
        .growth-loading__dots span:nth-child(3) { animation-delay: 0.3s; }
        @keyframes gb-pulse {
          0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }

        .growth-body { display: flex; flex-direction: column; gap: 18px; transition: opacity 0.2s ease; }
        .growth-body.is-refreshing { opacity: 0.55; }

        .trust-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          border: 1px solid var(--hairline);
          border-radius: 14px;
          background: var(--surface-card);
          padding: 13px 16px;
        }
        .trust-banner__main { display: inline-flex; align-items: center; gap: 12px; }
        .trust-banner__dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
        .trust-banner__main strong { display: block; font-size: 14px; }
        .trust-banner__pct { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
        .trust-banner__meta {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 11.5px; color: var(--muted);
        }
        .trust-banner__meta svg { color: var(--brand-teal); }

        .growth-warnings { display: flex; flex-direction: column; gap: 6px; }
        .growth-warnings__item {
          display: inline-flex; align-items: center; gap: 8px;
          font-size: 12.5px; color: var(--brand-ochre);
          background: color-mix(in srgb, var(--brand-ochre) 9%, transparent);
          border: 1px solid color-mix(in srgb, var(--brand-ochre) 25%, transparent);
          border-radius: 10px; padding: 8px 11px;
        }

        .growth-card {
          border: 1px solid var(--hairline);
          border-radius: 16px;
          background: var(--surface-card);
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .growth-card__title {
          display: inline-flex; align-items: center; gap: 9px;
          margin: 0; font-size: 15px; letter-spacing: -0.2px;
        }
        .growth-card__title svg { color: var(--brand-teal); }
        .growth-card__lede { margin: 0; font-size: 13px; color: var(--muted); line-height: 1.55; }
        .growth-card--summary { background: color-mix(in srgb, var(--brand-teal) 5%, var(--surface-card)); }
        .growth-summary__prose { margin: 0; font-size: 14.5px; line-height: 1.65; color: var(--ink); white-space: pre-wrap; }
        .growth-empty {
          font-size: 13px; color: var(--muted);
          border: 1px dashed var(--hairline); border-radius: 10px;
          padding: 14px; text-align: center;
        }

        .quality-insight {
          display: flex; align-items: flex-start; gap: 10px;
          font-size: 13px; line-height: 1.5; color: var(--ink);
          background: color-mix(in srgb, var(--brand-ochre) 10%, transparent);
          border: 1px solid color-mix(in srgb, var(--brand-ochre) 28%, transparent);
          border-radius: 12px; padding: 11px 13px;
        }
        .quality-insight svg { color: var(--brand-ochre); flex-shrink: 0; margin-top: 1px; }

        .funnel-table { display: flex; flex-direction: column; }
        .funnel-row {
          display: grid;
          grid-template-columns: 1.5fr 0.7fr 1.4fr 1.4fr 0.7fr 0.9fr;
          gap: 12px;
          align-items: center;
          padding: 11px 12px;
          border-radius: 10px;
          border: 1px solid transparent;
        }
        .funnel-row + .funnel-row { border-top: 1px solid var(--hairline-soft); }
        .funnel-row--head {
          font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em;
          font-weight: 700; color: var(--muted);
          border-top: none !important;
        }
        .funnel-row--top {
          background: color-mix(in srgb, var(--brand-teal) 9%, transparent);
          border: 1px solid color-mix(in srgb, var(--brand-teal) 40%, var(--hairline));
        }
        .funnel-channel { display: flex; flex-direction: column; gap: 4px; font-size: 13.5px; font-weight: 600; color: var(--ink); }
        .funnel-top-badge {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em;
          color: var(--brand-teal);
        }
        .funnel-num { font-size: 13.5px; font-variant-numeric: tabular-nums; color: var(--ink); }
        .funnel-bar-cell { display: flex; flex-direction: column; gap: 5px; }
        .funnel-bar-label { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
        .funnel-bar {
          position: relative; height: 7px; border-radius: 99px;
          background: color-mix(in srgb, var(--muted) 16%, transparent);
          overflow: hidden;
        }
        .funnel-bar__fill { position: absolute; inset: 0 auto 0 0; border-radius: 99px; }
        .funnel-bar__fill--activate { background: var(--brand-teal); }
        .funnel-bar__fill--paid { background: var(--brand-lavender); }
        .funnel-quality { display: flex; }

        .quality-badge {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 11px; font-weight: 700;
          padding: 4px 9px; border-radius: 99px;
        }

        .supersession { background: color-mix(in srgb, var(--brand-lavender) 5%, var(--surface-card)); }
        .supersession__cards {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 14px;
          align-items: stretch;
        }
        .supersession__col {
          display: flex; flex-direction: column; gap: 7px;
          border-radius: 14px; padding: 14px 16px;
          border: 1px solid var(--hairline);
        }
        .supersession__col--previous { background: color-mix(in srgb, var(--muted) 7%, transparent); }
        .supersession__col--current {
          background: color-mix(in srgb, var(--success) 9%, transparent);
          border-color: color-mix(in srgb, var(--success) 40%, var(--hairline));
        }
        .supersession__tag {
          font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
          color: var(--muted);
        }
        .supersession__tag--now { color: var(--success); }
        .supersession__value { margin: 0; font-size: 15px; line-height: 1.4; }
        .supersession__value--old { color: var(--muted); text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--muted) 60%, transparent); }
        .supersession__value--new { color: var(--ink); font-weight: 700; }
        .supersession__arrow { display: grid; place-items: center; color: var(--success); }

        .growth-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }

        .fact-list { display: flex; flex-direction: column; gap: 9px; margin: 0; padding: 0; list-style: none; }
        .fact-list__item {
          display: flex; flex-direction: column; gap: 5px;
          padding: 11px 13px; border-radius: 11px;
          border: 1px solid var(--hairline); background: var(--canvas);
        }
        .fact-list__text { font-size: 13.5px; line-height: 1.45; color: var(--ink); }
        .fact-list__foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .fact-list__conf {
          font-size: 10.5px; font-weight: 700; font-variant-numeric: tabular-nums;
          color: var(--brand-teal);
        }
        .fact-list__evidence {
          font-size: 11.5px; color: var(--muted); font-style: italic;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;
        }

        .growth-card--restricted { border-style: dashed; }
        .restricted-state {
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          text-align: center; padding: 22px 16px;
          color: var(--muted);
        }
        .restricted-state svg { color: var(--brand-ochre); }
        .restricted-state strong { font-size: 14px; color: var(--ink); }
        .restricted-state p { margin: 0; font-size: 12.5px; line-height: 1.55; max-width: 320px; }

        .action-checklist { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
        .action-checklist li {
          display: flex; align-items: flex-start; gap: 10px;
          padding: 11px 13px; border-radius: 11px;
          border: 1px solid var(--hairline);
          background: color-mix(in srgb, var(--success) 4%, var(--canvas));
        }
        .action-check { display: inline-flex; color: var(--success); flex-shrink: 0; margin-top: 1px; }
        .action-text { font-size: 13.5px; line-height: 1.45; color: var(--ink); }

        .citations-footer {
          display: flex; flex-direction: column; gap: 10px;
          border-top: 1px solid var(--hairline); padding-top: 16px;
        }
        .citations-footer__label {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
          color: var(--muted);
        }
        .citations-footer__list { display: flex; flex-wrap: wrap; gap: 8px; }
        .citation-pill {
          display: inline-flex; align-items: center; gap: 9px;
          padding: 8px 11px; border-radius: 10px;
          border: 1px solid var(--hairline); background: var(--surface-card);
          text-decoration: none; max-width: 320px;
          transition: border-color 0.15s ease;
        }
        a.citation-pill:hover { border-color: color-mix(in srgb, var(--brand-teal) 45%, var(--hairline)); }
        .citation-num {
          flex-shrink: 0; width: 20px; height: 20px; border-radius: 6px;
          display: grid; place-items: center; font-size: 11px; font-weight: 700;
          background: color-mix(in srgb, var(--brand-teal) 14%, transparent); color: var(--brand-teal);
        }
        .citation-meta { min-width: 0; display: flex; flex-direction: column; }
        .citation-meta strong { font-size: 12.5px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .citation-meta small { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .citations-footer__correct { font-size: 12px; color: var(--brand-teal); text-decoration: none; }
        .citations-footer__correct:hover { text-decoration: underline; }

        @media (max-width: 860px) {
          .growth-grid { grid-template-columns: 1fr; }
          .supersession__cards { grid-template-columns: 1fr; }
          .supersession__arrow { transform: rotate(90deg); }
          .funnel-row { grid-template-columns: 1fr 1fr; }
          .funnel-row--head { display: none; }
        }
      `}</style>
    </div>
  );
}

function QualityBadge({ score, paidRate }: { score?: number; paidRate?: number }) {
  const value = score ?? paidRate ?? 0;
  let label = 'Low';
  let color = 'var(--brand-ochre)';
  if (value >= 0.66) {
    label = 'High';
    color = 'var(--success)';
  } else if (value >= 0.33) {
    label = 'Medium';
    color = 'var(--brand-teal)';
  }
  return (
    <span
      className="quality-badge"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

function FactList({ facts, emptyLabel }: { facts: Fact[]; emptyLabel: string }) {
  if (facts.length === 0) {
    return <div className="growth-empty">{emptyLabel}</div>;
  }
  return (
    <ul className="fact-list">
      {facts.map((fact, index) => {
        const evidence = fact.evidence_spans?.[0];
        return (
          <li key={fact.id ?? index} className="fact-list__item">
            <span className="fact-list__text">{factText(fact)}</span>
            {(fact.confidence !== undefined || evidence) && (
              <span className="fact-list__foot">
                {fact.confidence !== undefined && (
                  <span className="fact-list__conf">{Math.round(fact.confidence * 100)}% confidence</span>
                )}
                {evidence && <span className="fact-list__evidence">“{evidence}”</span>}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
