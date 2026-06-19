import { useEffect, useState } from 'react';
import { Bot, Play, RefreshCw, Search, Shield, Terminal, Zap } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { api } from '../lib/api';
import type { AgentInfo } from '../lib/types';

const ICONS: Record<string, typeof Bot> = {
  commitguard: Shield,
  marketing: Zap,
  scheduler: Terminal,
  selfheal: Bot,
  research: Search,
};

const BRAND_COLORS = [
  { bg: 'rgba(255,77,139,.08)', fg: 'var(--brand-pink)' },
  { bg: 'rgba(26,58,58,.06)', fg: 'var(--brand-teal)' },
  { bg: 'rgba(184,164,237,.1)', fg: 'var(--brand-lavender)' },
  { bg: 'rgba(255,176,132,.1)', fg: 'var(--brand-peach)' },
  { bg: 'rgba(232,185,74,.1)', fg: 'var(--brand-ochre)' },
];

function statusDot(status: string) {
  const color =
    status === 'running'
      ? 'var(--brand-teal)'
      : status === 'error'
        ? 'var(--error)'
        : 'var(--success)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 12,
        fontWeight: 600,
        color,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      {status}
    </span>
  );
}

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [runTarget, setRunTarget] = useState<string | null>(null);
  const [goal, setGoal] = useState('');
  const [context, setContext] = useState('');
  const [launching, setLaunching] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await api.listAgents();
      setAgents(res.agents);
    } finally {
      setLoading(false);
    }
  }

  async function launchAgent() {
    if (!runTarget || !goal) return;
    setLaunching(true);
    try {
      await api.runAgent(runTarget, goal, context);
      setRunTarget(null);
      setGoal('');
      setContext('');
      void load();
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

  return (
    <div className="page">
      <PageHeader
        eyebrow="Roster"
        title="Agents"
        description="Active agents with their models, capabilities, sandbox policies, and current status."
        actions={
          <button className="secondary-button" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      {loading && <div className="empty-card">Loading agents…</div>}

      {!loading && agents.length === 0 && <div className="empty-card">No agents registered.</div>}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 16,
        }}
      >
        {agents.map((agent, idx) => {
          const Icon = ICONS[agent.id] ?? Bot;
          const accent = BRAND_COLORS[idx % BRAND_COLORS.length];
          return (
            <article
              key={agent.id}
              style={{
                border: '1px solid var(--hairline)',
                borderRadius: 16,
                background: 'var(--canvas)',
                padding: '22px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                transition: 'transform 150ms, box-shadow 150ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 30px rgba(10,10,10,.06)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = '';
                e.currentTarget.style.boxShadow = '';
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      background: accent.bg,
                      color: accent.fg,
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <Icon size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 16, letterSpacing: '-0.2px' }}>
                      {agent.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{agent.id}</div>
                  </div>
                </div>
                {statusDot(agent.status)}
              </div>

              <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.5 }}>
                {agent.description}
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {agent.capabilities.map((cap) => (
                  <span
                    key={cap}
                    style={{
                      padding: '3px 10px',
                      borderRadius: 9999,
                      fontSize: 11,
                      fontWeight: 600,
                      background: 'var(--surface-card)',
                      color: 'var(--muted)',
                      border: '1px solid var(--hairline)',
                    }}
                  >
                    {cap.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 18,
                  fontSize: 12,
                  color: 'var(--muted)',
                  borderTop: '1px solid var(--hairline)',
                  paddingTop: 12,
                  marginTop: 2,
                }}
              >
                <div>
                  <span
                    style={{
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      fontSize: 10,
                      letterSpacing: '0.5px',
                    }}
                  >
                    Model
                  </span>
                  <div style={{ color: 'var(--brand-teal)', fontWeight: 600, marginTop: 3 }}>
                    {agent.model}
                  </div>
                </div>
                <div>
                  <span
                    style={{
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      fontSize: 10,
                      letterSpacing: '0.5px',
                    }}
                  >
                    Sandbox
                  </span>
                  <div
                    style={{
                      fontWeight: 600,
                      marginTop: 3,
                      color: agent.sandbox ? 'var(--success)' : 'var(--muted-soft)',
                    }}
                  >
                    {agent.sandbox ?? 'none'}
                  </div>
                </div>
                <button
                  style={{
                    marginLeft: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '6px 14px',
                    borderRadius: 12,
                    border: 0,
                    background: 'var(--primary)',
                    color: 'var(--on-primary)',
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: 'pointer',
                    transition: 'background 150ms',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--primary-active)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--primary)';
                  }}
                  onClick={() => setRunTarget(agent.id)}
                >
                  <Play size={12} /> Run
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {runTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10,10,10,0.3)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 100,
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setRunTarget(null)}
        >
          <div
            style={{
              background: 'var(--canvas)',
              borderRadius: 24,
              padding: 32,
              width: 440,
              maxWidth: '90vw',
              border: '1px solid var(--hairline)',
              boxShadow: '0 20px 60px rgba(10,10,10,.12)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{ marginBottom: 20, fontSize: 20, fontWeight: 500, letterSpacing: '-0.5px' }}
            >
              Run {agents.find((a) => a.id === runTarget)?.name ?? runTarget}
            </h2>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 6,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Goal
            </label>
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What should the agent accomplish?"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid var(--hairline)',
                fontSize: 14,
                background: 'var(--canvas)',
                marginBottom: 14,
                color: 'var(--ink)',
              }}
            />
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 6,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Context (optional)
            </label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Additional context, URLs, parameters…"
              rows={3}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid var(--hairline)',
                fontSize: 14,
                background: 'var(--canvas)',
                marginBottom: 20,
                resize: 'vertical',
                color: 'var(--ink)',
              }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="secondary-button" onClick={() => setRunTarget(null)}>
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={!goal || launching}
                onClick={launchAgent}
              >
                {launching ? 'Launching…' : 'Launch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
