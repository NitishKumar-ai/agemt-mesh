import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock,
  GitBranch,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { StatusPill, automationStatusColor, Metric, Sparkline, relTime } from '../components/AutomationBits';
import { api } from '../lib/api';
import type { WorkflowRun } from '../lib/types';

interface WorkflowsPageProps {
  activeWorkflowId: string | null;
  onWorkflowSelect: (id: string | null) => void;
}

/**
 * An "automation" is a named, repeatable workflow definition. Each card shows
 * its trigger, last run health, and a recent-run sparkline. When the backend
 * has real workflow runs (api.listWorkflows) they are surfaced as a live
 * "Recent runs" rail; when empty we still present a credible catalogue so the
 * surface never looks broken in a demo.
 */
interface Automation {
  id: string;
  name: string;
  description: string;
  icon: typeof Workflow;
  accent: string;
  trigger: string;
  steps: number;
  status: 'healthy' | 'running' | 'paused' | 'failed';
  lastRun: string;
  successRate: number;
  spark: number[];
}

const DEMO_AUTOMATIONS: Automation[] = [
  {
    id: 'commit-guard-sweep',
    name: 'Commit Guard Sweep',
    description: 'Clones flagged repositories, runs SAST + secret scans, and files verified issues.',
    icon: ShieldCheck,
    accent: 'var(--brand-pink)',
    trigger: 'On push · main',
    steps: 5,
    status: 'healthy',
    lastRun: new Date(Date.now() - 22 * 60_000).toISOString(),
    successRate: 0.98,
    spark: [0.6, 0.7, 0.65, 0.8, 0.75, 0.9, 0.95, 0.98],
  },
  {
    id: 'atlas-daily-brief',
    name: 'Atlas Daily Brief',
    description: 'Synthesises a permission-aware status brief across Notion, Jira, and Slack each morning.',
    icon: Sparkles,
    accent: 'var(--brand-lavender)',
    trigger: 'Schedule · 08:00 daily',
    steps: 4,
    status: 'running',
    lastRun: new Date(Date.now() - 4 * 60_000).toISOString(),
    successRate: 0.94,
    spark: [0.8, 0.82, 0.78, 0.85, 0.9, 0.88, 0.92, 0.94],
  },
  {
    id: 'founder-growth-brief',
    name: 'Founder Growth Brief',
    description: 'Joins campaign, channel funnel, product usage, feedback, and revenue into a cited brief that flags outdated reports and recommends next actions.',
    icon: Sparkles,
    accent: 'var(--brand-teal)',
    trigger: 'Schedule · weekly',
    steps: 6,
    status: 'healthy',
    lastRun: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    successRate: 0.93,
    spark: [0.55, 0.6, 0.66, 0.72, 0.8, 0.86, 0.9, 0.93],
  },
  {
    id: 'renewal-watch',
    name: 'Renewal Risk Watch',
    description: 'Cross-references sales forecasts with delivery milestones and escalates at-risk ARR.',
    icon: Zap,
    accent: 'var(--brand-ochre)',
    trigger: 'Schedule · weekly',
    steps: 6,
    status: 'healthy',
    lastRun: new Date(Date.now() - 6 * 3_600_000).toISOString(),
    successRate: 0.91,
    spark: [0.5, 0.55, 0.6, 0.7, 0.68, 0.82, 0.88, 0.91],
  },
  {
    id: 'incident-selfheal',
    name: 'Incident Self-Heal',
    description: 'Detects Sev-2 signals, drafts a remediation plan, and opens a tracked workflow for approval.',
    icon: Activity,
    accent: 'var(--brand-teal)',
    trigger: 'On alert · pager',
    steps: 7,
    status: 'paused',
    lastRun: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    successRate: 0.87,
    spark: [0.4, 0.5, 0.62, 0.58, 0.7, 0.74, 0.8, 0.87],
  },
];

export function WorkflowsPage({ activeWorkflowId, onWorkflowSelect }: WorkflowsPageProps) {
  const [searchId, setSearchId] = useState('');
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAutomation, setSelectedAutomation] = useState<string | null>(DEMO_AUTOMATIONS[0].id);

  async function load() {
    setLoading(true);
    try {
      const res = await api.listWorkflows();
      setRuns(res.workflows || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchId.trim()) onWorkflowSelect(searchId.trim());
  };

  // Live runs from the backend, if any. Falls back to a synthetic recent-run
  // feed derived from the demo automations so the rail always reads as alive.
  const recentRuns = useMemo(() => {
    if (runs.length > 0) {
      return runs.slice(0, 8).map((wf) => ({
        runId: String(wf.run_id ?? wf.id ?? ''),
        label: String(wf.agent_id ?? wf.name ?? wf.run_id ?? 'workflow'),
        status: String(wf.status ?? 'idle'),
        startedAt: wf.started_at ?? Date.now(),
        live: true,
      }));
    }
    return DEMO_AUTOMATIONS.map((a, i) => ({
      runId: `${a.id}-run-${1000 + i}`,
      label: a.name,
      status: a.status === 'paused' ? 'queued' : a.status === 'running' ? 'running' : 'completed',
      startedAt: a.lastRun,
      live: false,
    }));
  }, [runs]);

  const stats = useMemo(() => {
    const total = DEMO_AUTOMATIONS.length;
    const active = DEMO_AUTOMATIONS.filter((a) => a.status !== 'paused').length;
    const liveRuns = runs.length;
    const avgSuccess =
      DEMO_AUTOMATIONS.reduce((acc, a) => acc + a.successRate, 0) / total;
    return { total, active, liveRuns, avgSuccess };
  }, [runs]);

  const active = DEMO_AUTOMATIONS.find((a) => a.id === selectedAutomation) ?? null;

  return (
    <div className="page automations-page">
      <PageHeader
        eyebrow="Orchestration"
        title="Automations"
        description="Repeatable, cited workflows your agents run on a trigger or schedule — with live run health."
        actions={
          <button className="secondary-button" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      <div className="auto-stats">
        <div className="auto-stat-card">
          <Metric label="Automations" value={stats.total} />
          <Workflow size={18} className="auto-stat-icon" style={{ color: 'var(--brand-lavender)' }} />
        </div>
        <div className="auto-stat-card">
          <Metric label="Active" value={stats.active} accent="var(--brand-teal)" />
          <Activity size={18} className="auto-stat-icon" style={{ color: 'var(--brand-teal)' }} />
        </div>
        <div className="auto-stat-card">
          <Metric label="Live runs" value={stats.liveRuns} accent="var(--brand-pink)" />
          <PlayCircle size={18} className="auto-stat-icon" style={{ color: 'var(--brand-pink)' }} />
        </div>
        <div className="auto-stat-card">
          <Metric
            label="Avg success"
            value={`${Math.round(stats.avgSuccess * 100)}%`}
            accent="var(--success)"
          />
          <CheckCircle2 size={18} className="auto-stat-icon" style={{ color: 'var(--success)' }} />
        </div>
      </div>

      <div className="auto-layout">
        <section className="auto-main">
          <div className="auto-grid">
            {DEMO_AUTOMATIONS.map((a) => {
              const Icon = a.icon;
              const isSelected = a.id === selectedAutomation;
              return (
                <article
                  key={a.id}
                  className={`auto-card${isSelected ? ' auto-card--active' : ''}`}
                  onClick={() => setSelectedAutomation(a.id)}
                  style={{ ['--accent' as string]: a.accent }}
                >
                  <div className="auto-card-top">
                    <div className="auto-card-icon">
                      <Icon size={20} />
                    </div>
                    <div className="auto-card-title">
                      <h3>{a.name}</h3>
                      <span className="auto-card-trigger">
                        <GitBranch size={11} /> {a.trigger}
                      </span>
                    </div>
                    <StatusPill status={a.status} />
                  </div>
                  <p className="auto-card-desc">{a.description}</p>
                  <div className="auto-card-foot">
                    <div className="auto-card-foot-meta">
                      <span className="auto-foot-label">{a.steps} steps</span>
                      <span className="auto-foot-dot">·</span>
                      <span className="auto-foot-label">
                        <Clock size={11} /> {relTime(a.lastRun)}
                      </span>
                    </div>
                    <div className="auto-card-spark">
                      <span className="auto-success">{Math.round(a.successRate * 100)}%</span>
                      <Sparkline points={a.spark} color={a.accent} width={72} height={24} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="auto-side">
          <div className="auto-inspect-card">
            <h4 className="auto-side-h">Inspect a run</h4>
            <p className="auto-side-sub">Open any DBOS workflow run by its id to trace task execution.</p>
            <form onSubmit={handleSearch} className="auto-inspect-form">
              <div className="auto-input-wrap">
                <Search size={14} />
                <input
                  type="text"
                  placeholder="wf-12345678"
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                />
              </div>
              <button type="submit" className="primary-button auto-inspect-btn">
                Inspect
              </button>
            </form>
            {activeWorkflowId && (
              <div className="auto-active-run">
                <span className="auto-foot-label">Inspecting</span>
                <code>{activeWorkflowId}</code>
                <button className="auto-clear" onClick={() => onWorkflowSelect(null)}>
                  Clear
                </button>
              </div>
            )}
          </div>

          {active && (
            <div className="auto-detail-card">
              <div className="auto-detail-head" style={{ ['--accent' as string]: active.accent }}>
                <div className="auto-card-icon">
                  <active.icon size={18} />
                </div>
                <div>
                  <h4 className="auto-side-h" style={{ margin: 0 }}>{active.name}</h4>
                  <StatusPill status={active.status} />
                </div>
              </div>
              <div className="auto-detail-rows">
                <div className="auto-detail-row">
                  <span>Trigger</span>
                  <strong>{active.trigger}</strong>
                </div>
                <div className="auto-detail-row">
                  <span>Steps</span>
                  <strong>{active.steps}</strong>
                </div>
                <div className="auto-detail-row">
                  <span>Last run</span>
                  <strong>{relTime(active.lastRun)}</strong>
                </div>
                <div className="auto-detail-row">
                  <span>Success rate</span>
                  <strong style={{ color: 'var(--success)' }}>
                    {Math.round(active.successRate * 100)}%
                  </strong>
                </div>
              </div>
            </div>
          )}

          <div className="auto-runs-card">
            <div className="auto-runs-head">
              <h4 className="auto-side-h" style={{ margin: 0 }}>Recent runs</h4>
              {recentRuns[0]?.live ? (
                <span className="auto-live-tag">live</span>
              ) : (
                <span className="auto-foot-label" style={{ fontSize: 10 }}>sample</span>
              )}
            </div>
            {loading ? (
              <div className="auto-empty">Loading runs…</div>
            ) : (
              <ul className="auto-runs-list">
                {recentRuns.map((r) => (
                  <li
                    key={r.runId}
                    className="auto-run-row"
                    onClick={() => r.live && onWorkflowSelect(r.runId)}
                    style={{ cursor: r.live ? 'pointer' : 'default' }}
                  >
                    <span
                      className="auto-run-dot"
                      style={{ background: automationStatusColor(r.status) }}
                    />
                    <span className="auto-run-label">{r.label}</span>
                    <StatusPill status={r.status} />
                    <span className="auto-run-time">{relTime(r.startedAt as string)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <style>{`
        .automations-page { display: flex; flex-direction: column; gap: 22px; }
        .auto-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 14px;
        }
        .auto-stat-card {
          position: relative;
          background: var(--surface-card, #1c2222);
          border: 1px solid var(--hairline);
          border-radius: 14px;
          padding: 16px 18px;
          overflow: hidden;
        }
        .auto-stat-icon { position: absolute; top: 14px; right: 14px; opacity: 0.85; }
        .auto-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 340px;
          gap: 20px;
          align-items: start;
        }
        @media (max-width: 1024px) { .auto-layout { grid-template-columns: 1fr; } }
        .auto-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
        }
        .auto-card {
          position: relative;
          background: var(--canvas);
          border: 1px solid var(--hairline);
          border-radius: 16px;
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          cursor: pointer;
          transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
        }
        .auto-card::before {
          content: '';
          position: absolute;
          left: 0; top: 16px; bottom: 16px;
          width: 3px;
          border-radius: 3px;
          background: var(--accent);
          opacity: 0.0;
          transition: opacity 160ms ease;
        }
        .auto-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 34px rgba(10,10,10,.10);
          border-color: color-mix(in srgb, var(--accent) 40%, var(--hairline));
        }
        .auto-card--active { border-color: var(--accent); }
        .auto-card--active::before { opacity: 1; }
        .auto-card-top { display: flex; align-items: center; gap: 12px; }
        .auto-card-icon {
          width: 40px; height: 40px; border-radius: 12px;
          display: grid; place-items: center; flex-shrink: 0;
          color: var(--accent);
          background: color-mix(in srgb, var(--accent) 12%, transparent);
        }
        .auto-card-title { flex: 1; min-width: 0; }
        .auto-card-title h3 {
          margin: 0; font-size: 15px; font-weight: 650; letter-spacing: -0.2px;
          color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .auto-card-trigger {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; color: var(--muted); margin-top: 2px;
        }
        .auto-card-desc { font-size: 13px; line-height: 1.5; color: var(--muted); margin: 0; }
        .auto-card-foot {
          display: flex; align-items: center; justify-content: space-between;
          gap: 10px; padding-top: 12px; border-top: 1px solid var(--hairline);
        }
        .auto-card-foot-meta { display: flex; align-items: center; gap: 8px; }
        .auto-foot-label {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; color: var(--muted); white-space: nowrap;
        }
        .auto-foot-dot { color: var(--muted-soft); }
        .auto-card-spark { display: flex; align-items: center; gap: 8px; }
        .auto-success { font-size: 12px; font-weight: 700; color: var(--success); }
        .auto-side { display: flex; flex-direction: column; gap: 16px; position: sticky; top: 12px; }
        .auto-inspect-card, .auto-detail-card, .auto-runs-card {
          background: var(--surface-card, #1c2222);
          border: 1px solid var(--hairline);
          border-radius: 16px;
          padding: 18px;
        }
        .auto-side-h { font-size: 13px; font-weight: 700; color: var(--ink); margin: 0 0 4px; }
        .auto-side-sub { font-size: 12px; color: var(--muted); margin: 0 0 12px; line-height: 1.5; }
        .auto-inspect-form { display: flex; flex-direction: column; gap: 8px; }
        .auto-input-wrap {
          display: flex; align-items: center; gap: 8px;
          padding: 9px 12px; border-radius: 10px;
          background: var(--canvas); border: 1px solid var(--hairline);
          color: var(--muted);
        }
        .auto-input-wrap input {
          flex: 1; border: none; background: transparent; outline: none;
          color: var(--ink); font-size: 13px; font-family: ui-monospace, monospace;
        }
        .auto-inspect-btn { width: 100%; justify-content: center; border-radius: 10px; }
        .auto-active-run {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
          margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--hairline);
        }
        .auto-active-run code {
          font-size: 12px; color: var(--brand-teal);
          font-family: ui-monospace, monospace; flex: 1; min-width: 0;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .auto-clear {
          border: none; background: transparent; color: var(--muted);
          font-size: 12px; cursor: pointer; padding: 2px 6px; border-radius: 6px;
        }
        .auto-clear:hover { color: var(--ink); background: var(--canvas); }
        .auto-detail-head {
          display: flex; align-items: center; gap: 12px; margin-bottom: 14px;
        }
        .auto-detail-rows { display: flex; flex-direction: column; gap: 0; }
        .auto-detail-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 9px 0; border-top: 1px solid var(--hairline);
          font-size: 13px;
        }
        .auto-detail-row:first-child { border-top: none; }
        .auto-detail-row span { color: var(--muted); }
        .auto-detail-row strong { color: var(--ink); font-weight: 600; }
        .auto-runs-head {
          display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;
        }
        .auto-live-tag {
          font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
          color: var(--brand-teal); padding: 2px 8px; border-radius: 9999px;
          background: color-mix(in srgb, var(--brand-teal) 14%, transparent);
        }
        .auto-runs-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
        .auto-run-row {
          display: flex; align-items: center; gap: 8px;
          padding: 9px 0; border-top: 1px solid var(--hairline);
        }
        .auto-run-row:first-child { border-top: none; }
        .auto-run-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .auto-run-label {
          flex: 1; min-width: 0; font-size: 12.5px; color: var(--ink); font-weight: 500;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .auto-run-time { font-size: 11px; color: var(--muted); white-space: nowrap; }
        .auto-empty { font-size: 13px; color: var(--muted); padding: 8px 0; }
      `}</style>
    </div>
  );
}
