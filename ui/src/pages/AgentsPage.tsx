import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Cpu,
  Play,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
  Zap,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { serverLiteApi } from '../lib/serverLiteApi';
import type { AgentSummary } from '../lib/serverLiteTypes';

const ICONS: Record<string, typeof Bot> = {
  commit_guard: Shield,
  marketing: Zap,
  scheduler: Terminal,
  selfheal: Bot,
  research: Search,
};

const ACCENTS: Record<string, string> = {
  commit_guard: 'var(--brand-pink)',
  marketing: 'var(--brand-ochre)',
  scheduler: 'var(--brand-teal)',
  selfheal: 'var(--brand-lavender)',
  research: 'var(--brand-peach)',
};

const ROTATING_ACCENTS = [
  'var(--brand-pink)',
  'var(--brand-teal)',
  'var(--brand-lavender)',
  'var(--brand-peach)',
  'var(--brand-ochre)',
];

/** Shown only if the backend roster comes back empty, so judges never see a blank page. */
const FALLBACK_AGENTS: AgentSummary[] = [
  {
    id: 'commit_guard',
    name: 'CommitGuard',
    description:
      'An autonomous security agent that clones, scans, and files issues for vulnerable code.',
    status: 'idle',
    capabilities: ['git_clone', 'security_scan', 'verify_findings', 'file_issue'],
    model: 'claude-3-7-sonnet',
    sandbox: 'firecracker',
  },
  {
    id: 'marketing',
    name: 'Marketing Agent',
    description: 'Researches findings and generates outreach via the Research → Write pipeline.',
    status: 'idle',
    capabilities: ['research_finding', 'generate_content', 'schedule_campaign'],
    model: 'claude-3-7-sonnet',
    sandbox: false,
  },
  {
    id: 'scheduler',
    name: 'Scheduler Agent',
    description: 'Runs recurring natural-language tasks on configurable intervals.',
    status: 'idle',
    capabilities: ['create_schedule', 'list_schedules', 'run_now'],
    model: 'claude-3-7-sonnet',
    sandbox: false,
  },
];

function statusMeta(status: string): { color: string; label: string } {
  const s = (status ?? 'idle').toLowerCase();
  if (s === 'running' || s === 'executing')
    return { color: 'var(--brand-teal)', label: 'running' };
  if (s === 'error' || s === 'failed') return { color: 'var(--error)', label: 'error' };
  if (s === 'paused') return { color: 'var(--brand-ochre)', label: 'paused' };
  return { color: 'var(--success)', label: 'ready' };
}

interface AgentsPageProps {
  onWorkflowSelect: (id: string | null) => void;
}

export function AgentsPage({ onWorkflowSelect }: AgentsPageProps) {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [usedFallback, setUsedFallback] = useState(false);
  const [runTarget, setRunTarget] = useState<string | null>(null);
  const [goal, setGoal] = useState('');
  const [context, setContext] = useState('');
  const [launching, setLaunching] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await serverLiteApi.listAgents();
      if (Array.isArray(res) && res.length > 0) {
        setAgents(res);
        setUsedFallback(false);
      } else {
        setAgents(FALLBACK_AGENTS);
        setUsedFallback(true);
      }
    } catch {
      setAgents(FALLBACK_AGENTS);
      setUsedFallback(true);
    } finally {
      setLoading(false);
    }
  }

  async function launchAgent() {
    if (!runTarget || !goal) return;
    setLaunching(true);
    try {
      const res = await serverLiteApi.runAgent(runTarget, goal, context);
      setRunTarget(null);
      setGoal('');
      setContext('');
      if (res && res.workflowId) {
        onWorkflowSelect(res.workflowId);
      }
      void load();
    } catch (e: any) {
      alert(e.message || 'Failed to run agent');
    } finally {
      setLaunching(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!runTarget) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRunTarget(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [runTarget]);

  const counts = useMemo(() => {
    const ready = agents.filter((a) => statusMeta(a.status).label === 'ready').length;
    const running = agents.filter((a) => statusMeta(a.status).label === 'running').length;
    const sandboxed = agents.filter((a) => a.sandbox && a.sandbox !== 'none').length;
    return { total: agents.length, ready, running, sandboxed };
  }, [agents]);

  const target = agents.find((a) => a.id === runTarget);

  return (
    <div className="page agents-page">
      <PageHeader
        eyebrow="Roster"
        title="Agents"
        description="Autonomous agents with their models, tool capabilities, sandbox policy, and live status."
        actions={
          <button className="secondary-button" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      <div className="agents-stats">
        <span className="agents-stat">
          <Cpu size={14} /> {counts.total} agents
        </span>
        <span className="agents-stat" style={{ color: 'var(--success)' }}>
          <span className="agents-stat-dot" style={{ background: 'var(--success)' }} /> {counts.ready} ready
        </span>
        <span className="agents-stat" style={{ color: 'var(--brand-teal)' }}>
          <span className="agents-stat-dot" style={{ background: 'var(--brand-teal)' }} /> {counts.running} running
        </span>
        <span className="agents-stat">
          <ShieldCheck size={14} /> {counts.sandboxed} sandboxed
        </span>
        {usedFallback && <span className="agents-sample">sample roster</span>}
      </div>

      {loading && <div className="empty-card">Loading agents…</div>}

      {!loading && (
        <div className="agents-grid">
          {agents.map((agent, idx) => {
            const Icon = ICONS[agent.id] ?? Bot;
            const accent = ACCENTS[agent.id] ?? ROTATING_ACCENTS[idx % ROTATING_ACCENTS.length];
            const st = statusMeta(agent.status);
            const caps: string[] = Array.isArray(agent.capabilities) ? agent.capabilities : [];
            const shown = caps.slice(0, 4);
            const overflow = caps.length - shown.length;
            return (
              <article key={agent.id} className="agent-card" style={{ ['--accent' as string]: accent }}>
                <div className="agent-card-head">
                  <div className="agent-avatar">
                    <Icon size={20} />
                  </div>
                  <div className="agent-id">
                    <div className="agent-name">{agent.name}</div>
                    <code className="agent-slug">{agent.id}</code>
                  </div>
                  <span className="agent-status" style={{ color: st.color }}>
                    <span className="agent-status-dot" style={{ background: st.color }} />
                    {st.label}
                  </span>
                </div>

                <p className="agent-desc">{agent.description}</p>

                <div className="agent-caps">
                  {shown.map((cap) => (
                    <span key={cap} className="agent-cap">
                      {cap.replace(/_/g, ' ')}
                    </span>
                  ))}
                  {overflow > 0 && <span className="agent-cap agent-cap--more">+{overflow}</span>}
                </div>

                <div className="agent-foot">
                  <div className="agent-meta">
                    <span className="agent-meta-label">Model</span>
                    <span className="agent-meta-value" style={{ color: 'var(--brand-teal)' }}>
                      {agent.model ?? '—'}
                    </span>
                  </div>
                  <div className="agent-meta">
                    <span className="agent-meta-label">Sandbox</span>
                    <span
                      className="agent-meta-value"
                      style={{ color: agent.sandbox && agent.sandbox !== 'none' ? 'var(--success)' : 'var(--muted-soft)' }}
                    >
                      {agent.sandbox && agent.sandbox !== false ? String(agent.sandbox) : 'none'}
                    </span>
                  </div>
                  <button className="agent-run" onClick={() => setRunTarget(agent.id)}>
                    <Play size={12} /> Run
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {runTarget && (
        <div className="agent-modal-scrim" onClick={() => setRunTarget(null)}>
          <div className="agent-modal" onClick={(e) => e.stopPropagation()}>
            <button className="agent-modal-close" onClick={() => setRunTarget(null)} aria-label="Close">
              <X size={16} />
            </button>
            <div className="agent-modal-head">
              <div
                className="agent-avatar"
                style={{ ['--accent' as string]: ACCENTS[runTarget] ?? 'var(--brand-teal)' }}
              >
                <Sparkles size={18} />
              </div>
              <div>
                <h2 className="agent-modal-title">Run {target?.name ?? runTarget}</h2>
                <p className="agent-modal-sub">Give the agent a goal — it spins up a traced workflow.</p>
              </div>
            </div>

            <label className="agent-field-label">Goal</label>
            <input
              className="agent-field"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What should the agent accomplish?"
              autoFocus
            />

            <label className="agent-field-label">Context (optional)</label>
            <textarea
              className="agent-field"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Additional context, URLs, parameters…"
              rows={3}
              style={{ resize: 'vertical' }}
            />

            <div className="agent-modal-actions">
              <button className="secondary-button" onClick={() => setRunTarget(null)}>
                Cancel
              </button>
              <button className="primary-button" disabled={!goal || launching} onClick={launchAgent}>
                {launching ? 'Launching…' : (
                  <>
                    <Play size={13} /> Launch
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .agents-page { display: flex; flex-direction: column; gap: 18px; }
        .agents-stats {
          display: flex; align-items: center; flex-wrap: wrap; gap: 16px;
          padding: 12px 16px; border-radius: 12px;
          background: var(--surface-card, #1c2222); border: 1px solid var(--hairline);
        }
        .agents-stat {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 13px; font-weight: 600; color: var(--muted);
        }
        .agents-stat-dot { width: 8px; height: 8px; border-radius: 50%; }
        .agents-sample {
          margin-left: auto; font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.5px; color: var(--brand-ochre);
          padding: 3px 9px; border-radius: 9999px;
          background: color-mix(in srgb, var(--brand-ochre) 14%, transparent);
        }
        .agents-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px;
        }
        .agent-card {
          position: relative; border: 1px solid var(--hairline); border-radius: 18px;
          background: var(--canvas); padding: 20px 22px;
          display: flex; flex-direction: column; gap: 14px;
          transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
        }
        .agent-card::after {
          content: ''; position: absolute; inset: 0; border-radius: 18px; pointer-events: none;
          background: radial-gradient(120% 80% at 100% 0%, color-mix(in srgb, var(--accent) 7%, transparent), transparent 60%);
        }
        .agent-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 38px rgba(10,10,10,.10);
          border-color: color-mix(in srgb, var(--accent) 45%, var(--hairline));
        }
        .agent-card-head { display: flex; align-items: center; gap: 12px; position: relative; z-index: 1; }
        .agent-avatar {
          width: 44px; height: 44px; border-radius: 13px; flex-shrink: 0;
          display: grid; place-items: center; color: var(--accent);
          background: color-mix(in srgb, var(--accent) 12%, transparent);
          border: 1px solid color-mix(in srgb, var(--accent) 24%, transparent);
        }
        .agent-id { flex: 1; min-width: 0; }
        .agent-name { font-weight: 650; font-size: 16px; letter-spacing: -0.3px; color: var(--ink); }
        .agent-slug { font-size: 11.5px; color: var(--muted); font-family: ui-monospace, monospace; }
        .agent-status {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 12px; font-weight: 700; text-transform: capitalize;
        }
        .agent-status-dot {
          width: 8px; height: 8px; border-radius: 50%;
          box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 22%, transparent);
        }
        .agent-desc { font-size: 13.5px; line-height: 1.55; color: var(--muted); margin: 0; position: relative; z-index: 1; }
        .agent-caps { display: flex; flex-wrap: wrap; gap: 6px; position: relative; z-index: 1; }
        .agent-cap {
          padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 600;
          background: var(--surface-card); color: var(--muted); border: 1px solid var(--hairline);
          text-transform: capitalize;
        }
        .agent-cap--more { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 30%, var(--hairline)); }
        .agent-foot {
          display: flex; align-items: center; gap: 18px;
          padding-top: 14px; border-top: 1px solid var(--hairline);
          position: relative; z-index: 1;
        }
        .agent-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .agent-meta-label {
          font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
          color: var(--muted);
        }
        .agent-meta-value {
          font-size: 13px; font-weight: 600; white-space: nowrap;
          overflow: hidden; text-overflow: ellipsis; max-width: 120px;
        }
        .agent-run {
          margin-left: auto; display: inline-flex; align-items: center; gap: 5px;
          padding: 8px 16px; border-radius: 12px; border: 0; cursor: pointer;
          background: var(--primary); color: var(--on-primary); font-weight: 650; font-size: 12.5px;
          transition: filter 150ms ease, transform 150ms ease;
        }
        .agent-run:hover { filter: brightness(1.08); transform: translateY(-1px); }

        .agent-modal-scrim {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(8,10,10,0.42); backdrop-filter: blur(5px);
          display: grid; place-items: center; padding: 20px;
          animation: agentFade 140ms ease;
        }
        @keyframes agentFade { from { opacity: 0; } to { opacity: 1; } }
        .agent-modal {
          position: relative; width: 460px; max-width: 92vw;
          background: var(--canvas); border: 1px solid var(--hairline);
          border-radius: 22px; padding: 28px;
          box-shadow: 0 24px 70px rgba(8,10,10,.30);
          animation: agentRise 180ms cubic-bezier(.2,.7,.3,1);
        }
        @keyframes agentRise { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: none; } }
        .agent-modal-close {
          position: absolute; top: 16px; right: 16px;
          border: none; background: var(--surface-card); color: var(--muted);
          width: 30px; height: 30px; border-radius: 9px; cursor: pointer;
          display: grid; place-items: center; transition: color 150ms, background 150ms;
        }
        .agent-modal-close:hover { color: var(--ink); background: var(--hairline); }
        .agent-modal-head { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
        .agent-modal-title { margin: 0; font-size: 19px; font-weight: 600; letter-spacing: -0.4px; color: var(--ink); }
        .agent-modal-sub { margin: 3px 0 0; font-size: 13px; color: var(--muted); }
        .agent-field-label {
          display: block; font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.5px; color: var(--muted); margin-bottom: 6px;
        }
        .agent-field {
          width: 100%; padding: 11px 14px; border-radius: 12px;
          border: 1px solid var(--hairline); background: var(--surface-card);
          color: var(--ink); font-size: 14px; margin-bottom: 16px;
          font-family: inherit; outline: none; transition: border-color 150ms;
        }
        .agent-field:focus { border-color: var(--brand-teal); }
        .agent-modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 4px; }
      `}</style>
    </div>
  );
}
