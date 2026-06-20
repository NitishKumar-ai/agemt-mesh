import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { api } from '../lib/api';
import type { SafetyEscalation, SafetyStats, SafetyVerdict } from '../lib/types';

const VERDICT_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  PASS: { bg: 'rgba(34,197,94,.08)', fg: '#16a34a', border: 'rgba(34,197,94,.2)' },
  FLAG: { bg: 'rgba(232,185,74,.1)', fg: '#b8860b', border: 'rgba(232,185,74,.25)' },
  BLOCK: { bg: 'rgba(239,68,68,.06)', fg: '#dc2626', border: 'rgba(239,68,68,.2)' },
};

const RISK_COLORS: Record<string, string> = {
  low: 'var(--success)',
  medium: 'var(--brand-ochre)',
  high: 'var(--brand-coral)',
  critical: 'var(--brand-pink)',
};

function VerdictPill({ verdict }: { verdict: string }) {
  const c = VERDICT_COLORS[verdict] || VERDICT_COLORS.FLAG;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 12px',
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 600,
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
      }}
    >
      {verdict === 'PASS' && <CheckCircle2 size={12} />}
      {verdict === 'FLAG' && <AlertTriangle size={12} />}
      {verdict === 'BLOCK' && <XCircle size={12} />}
      {verdict}
    </span>
  );
}

function RiskPill({ tier }: { tier: string }) {
  const color = RISK_COLORS[tier] || 'var(--muted)';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 9999,
        fontSize: 11,
        fontWeight: 600,
        color,
        border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
        background: `color-mix(in srgb, ${color} 8%, transparent)`,
      }}
    >
      {tier}
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: typeof Shield;
  accent?: string;
}) {
  const accentColor = accent ?? 'var(--brand-ochre)';
  return (
    <div
      style={{
        background: 'var(--canvas)',
        border: '1px solid var(--hairline)',
        borderRadius: 16,
        padding: 22,
        flex: '1 1 160px',
        minWidth: 140,
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon size={16} style={{ color: accentColor }} />
        <span
          style={{
            fontSize: 12,
            color: 'var(--muted)',
            fontWeight: 600,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-1px' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

export function SafetyPage() {
  const [stats, setStats] = useState<SafetyStats | null>(null);
  const [verdicts, setVerdicts] = useState<SafetyVerdict[]>([]);
  const [escalations, setEscalations] = useState<SafetyEscalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [tab, setTab] = useState<'verdicts' | 'escalations'>('verdicts');
  const [resolveText, setResolveText] = useState('');

  async function refresh() {
    setLoading(true);
    try {
      const [s, v, e] = await Promise.all([
        api.safetyStats(),
        api.safetyVerdicts(),
        api.safetyEscalations(),
      ]);
      setStats(s);
      setVerdicts(v.verdicts);
      setEscalations(e.escalations);
    } catch {
      /* empty */
    }
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleResolve(id: number) {
    if (!resolveText.trim()) return;
    await api.resolveEscalation(id, resolveText);
    setResolveText('');
    void refresh();
  }

  const passRate =
    stats && stats.total_evaluations > 0
      ? Math.round(((stats.by_verdict['PASS'] || 0) / stats.total_evaluations) * 100)
      : 0;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Track B"
        title="Safety — CriticGate"
        description="Recursive Self-Correction Protocol. Every agent action is evaluated by a trusted Critic before execution."
        actions={
          <button
            onClick={refresh}
            className="secondary-button"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
        }
      />

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 28, flexWrap: 'wrap' }}>
        <StatCard
          icon={Shield}
          label="Total Evaluations"
          value={stats?.total_evaluations ?? '—'}
          accent="var(--brand-teal)"
        />
        <StatCard
          icon={ShieldCheck}
          label="Pass Rate"
          value={`${passRate}%`}
          sub={`${stats?.by_verdict['PASS'] ?? 0} passed`}
          accent="var(--success)"
        />
        <StatCard
          icon={ShieldAlert}
          label="Flagged"
          value={stats?.by_verdict['FLAG'] ?? 0}
          sub="Escalated for review"
          accent="var(--brand-ochre)"
        />
        <StatCard
          icon={ShieldX}
          label="Blocked"
          value={stats?.by_verdict['BLOCK'] ?? 0}
          sub={`${stats?.counterfactual_blocks ?? 0} counterfactual`}
          accent="var(--brand-coral)"
        />
        <StatCard
          icon={Clock}
          label="Avg Eval Time"
          value={`${stats?.avg_eval_duration_ms ?? 0}ms`}
          sub={`Confidence: ${stats?.avg_confidence ?? 0}`}
          accent="var(--brand-lavender)"
        />
        <StatCard
          icon={AlertTriangle}
          label="Open Escalations"
          value={stats?.open_escalations ?? 0}
          accent="var(--brand-pink)"
        />
      </div>

      {/* Risk tier breakdown */}
      {stats && Object.keys(stats.by_risk_tier).length > 0 && (
        <div
          style={{
            background: 'var(--canvas)',
            border: '1px solid var(--hairline)',
            borderRadius: 16,
            padding: 18,
            marginBottom: 28,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, letterSpacing: '-0.2px' }}>
            Risk Tier Distribution
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {Object.entries(stats.by_risk_tier).map(([tier, count]) => (
              <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <RiskPill tier={tier} />
                <span style={{ fontSize: 15, fontWeight: 500 }}>{count as any}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 18 }}>
        {(['verdicts', 'escalations'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 20px',
              fontSize: 13,
              fontWeight: 600,
              border: 0,
              borderRadius: 9999,
              cursor: 'pointer',
              background: tab === t ? 'var(--surface-card)' : 'transparent',
              color: tab === t ? 'var(--ink)' : 'var(--muted)',
              transition: 'all 150ms',
            }}
          >
            {t === 'verdicts'
              ? `Verdicts (${verdicts.length})`
              : `Escalations (${escalations.length})`}
          </button>
        ))}
      </div>

      {/* Verdicts list */}
      {tab === 'verdicts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {verdicts.length === 0 && !loading && (
            <div className="empty-card">
              No critic evaluations yet. Run an agent to see safety verdicts here.
            </div>
          )}
          {verdicts.map((v) => {
            const expanded = expandedId === v.id;
            return (
              <div
                key={v.id}
                style={{
                  background: 'var(--canvas)',
                  border: '1px solid var(--hairline)',
                  borderRadius: 16,
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => setExpandedId(expanded ? null : v.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '16px 18px',
                    background: 'none',
                    border: 0,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {expanded ? (
                    <ChevronDown size={14} color="var(--muted)" />
                  ) : (
                    <ChevronRight size={14} color="var(--muted)" />
                  )}
                  <VerdictPill verdict={v.verdict} />
                  <RiskPill tier={v.risk_tier} />
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>
                    {v.agent_id}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {v.confidence.toFixed(2)} confidence
                  </span>
                  <span
                    style={{ fontSize: 11, color: 'var(--muted-soft)', fontFamily: 'monospace' }}
                  >
                    {v.eval_duration_ms}ms
                  </span>
                  {v.counterfactual_flag && (
                    <span
                      style={{
                        fontSize: 10,
                        padding: '3px 8px',
                        borderRadius: 9999,
                        background: 'rgba(255,77,139,.08)',
                        color: 'var(--brand-pink)',
                        fontWeight: 600,
                      }}
                    >
                      COUNTERFACTUAL
                    </span>
                  )}
                </button>
                {expanded && (
                  <div style={{ padding: '0 18px 18px 44px', fontSize: 13 }}>
                    <div style={{ marginBottom: 10 }}>
                      <span style={{ fontWeight: 600, color: 'var(--ink)' }}>Reasoning: </span>
                      <span style={{ color: 'var(--body)' }}>{v.reasoning}</span>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <span style={{ fontWeight: 600, color: 'var(--ink)' }}>Checks: </span>
                      <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
                        {Object.entries(v.checks).map(([k, passed]) => (
                          <span
                            key={k}
                            style={{
                              fontSize: 11,
                              padding: '3px 8px',
                              borderRadius: 9999,
                              background: passed ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.06)',
                              color: passed ? 'var(--success)' : 'var(--error)',
                            }}
                          >
                            {passed ? '✓' : '✗'} {k}
                          </span>
                        ))}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 18, fontSize: 12, color: 'var(--muted)' }}>
                      <span>
                        Run: <code>{v.run_id.slice(0, 12)}</code>
                      </span>
                      <span>
                        Frame: <code>{v.frame_hash}</code>
                      </span>
                      <span>Depth: {v.recursion_depth}</span>
                      <span>Model: {v.critic_model}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Escalations list */}
      {tab === 'escalations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {escalations.length === 0 && !loading && (
            <div className="empty-card">
              No escalations. Blocked or flagged actions from the Critic will appear here.
            </div>
          )}
          {escalations.map((e) => (
            <div
              key={e.id}
              style={{
                background: 'var(--canvas)',
                border: '1px solid var(--hairline)',
                borderRadius: 16,
                padding: 18,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span
                  style={{
                    fontSize: 11,
                    padding: '3px 10px',
                    borderRadius: 9999,
                    fontWeight: 600,
                    background: e.resolved ? 'rgba(34,197,94,.08)' : 'rgba(232,185,74,.1)',
                    color: e.resolved ? 'var(--success)' : 'var(--brand-ochre)',
                    border: `1px solid ${e.resolved ? 'rgba(34,197,94,.2)' : 'rgba(232,185,74,.25)'}`,
                  }}
                >
                  {e.resolved ? 'Resolved' : 'Open'}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                  {e.escalation_type}
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Agent: {e.agent_id}</span>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--muted-soft)',
                    marginLeft: 'auto',
                    fontFamily: 'monospace',
                  }}
                >
                  {e.frame_hash}
                </span>
              </div>
              {e.resolved && e.resolution && (
                <div style={{ fontSize: 13, color: 'var(--body)', marginBottom: 10 }}>
                  <span style={{ fontWeight: 600 }}>Resolution:</span> {e.resolution}
                  {e.resolved_by && <span> — by {e.resolved_by}</span>}
                </div>
              )}
              {!e.resolved && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <input
                    placeholder="Resolution note…"
                    value={resolveText}
                    onChange={(ev) => setResolveText(ev.target.value)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      fontSize: 13,
                      border: '1px solid var(--hairline)',
                      borderRadius: 12,
                      background: 'var(--canvas)',
                      color: 'var(--ink)',
                    }}
                  />
                  <button
                    onClick={() => handleResolve(e.id)}
                    className="primary-button"
                    style={{ fontSize: 13, padding: '8px 18px' }}
                  >
                    Resolve
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
