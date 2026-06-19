import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, OctagonX, ShieldOff, XCircle } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { api } from '../lib/api';
import type { AppSettings } from '../lib/types';

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      {ok ? (
        <CheckCircle2 size={15} color="var(--success)" />
      ) : (
        <XCircle size={15} color="var(--error)" />
      )}
      <span style={{ color: ok ? 'var(--success)' : 'var(--error)', fontWeight: 600 }}>
        {label} {ok ? 'configured' : 'not configured'}
      </span>
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, letterSpacing: '-0.2px' }}>
        {title}
      </h2>
      <p style={{ color: 'var(--muted)', fontSize: 14 }}>{description}</p>
    </div>
  );
}

function Card({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <div
      style={{
        border: `1px solid ${danger ? 'rgba(239,68,68,.2)' : 'var(--hairline)'}`,
        borderRadius: 16,
        padding: '20px 22px',
        background: danger ? 'rgba(255,107,90,.04)' : 'var(--canvas)',
        marginBottom: 22,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {children}
    </div>
  );
}

function ModelField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--muted)',
          textTransform: 'uppercase',
          marginBottom: 6,
          letterSpacing: '0.5px',
        }}
      >
        {label}
      </div>
      <code
        style={{
          display: 'block',
          padding: '10px 14px',
          background: 'var(--surface-card)',
          borderRadius: 12,
          fontSize: 13,
          color: 'var(--brand-teal)',
          border: '1px solid var(--hairline)',
        }}
      >
        {value}
      </code>
      <p style={{ fontSize: 11, color: 'var(--muted-soft)', marginTop: 5 }}>
        Override via env var <code>MODEL_{label.replace(' ', '_').toUpperCase()}</code>
      </p>
    </div>
  );
}

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [killswitchPending, setKillswitchPending] = useState(false);
  const [confirmKill, setConfirmKill] = useState(false);

  useEffect(() => {
    api
      .getSettings()
      .then(setSettings)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function toggleKillswitch() {
    if (!settings) return;
    if (settings.killswitch_active) {
      setKillswitchPending(true);
      try {
        const res = await api.disengageKillswitch();
        setSettings({ ...settings, killswitch_active: res.killswitch_active });
      } finally {
        setKillswitchPending(false);
      }
    } else {
      if (!confirmKill) {
        setConfirmKill(true);
        return;
      }
      setKillswitchPending(true);
      setConfirmKill(false);
      try {
        const res = await api.engageKillswitch();
        setSettings({ ...settings, killswitch_active: res.killswitch_active });
      } finally {
        setKillswitchPending(false);
      }
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Operations"
        title="Settings"
        description="Runtime configuration, integrations, and safety controls."
      />

      {loading && <div className="empty-card">Loading settings…</div>}
      {error && (
        <div className="empty-card" style={{ color: 'var(--muted)' }}>
          Could not load settings — the backend is not reachable.
        </div>
      )}

      {settings && (
        <>
          {/* Global Killswitch */}
          <SectionHeader
            title="Emergency stop"
            description="Immediately halt all running agent workflows. Agents already mid-step will finish their current step but will not continue."
          />
          <Card danger={settings.killswitch_active}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {settings.killswitch_active ? (
                  <OctagonX size={24} color="var(--brand-coral)" />
                ) : (
                  <ShieldOff size={24} color="var(--muted)" />
                )}
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 15,
                      color: settings.killswitch_active ? 'var(--brand-coral)' : 'var(--ink)',
                      letterSpacing: '-0.2px',
                    }}
                  >
                    {settings.killswitch_active
                      ? 'Killswitch ENGAGED — all agents halted'
                      : 'Killswitch disengaged'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {settings.killswitch_active
                      ? 'No new workflows will start. Click to resume normal operation.'
                      : 'Agents are running normally.'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {confirmKill && !settings.killswitch_active && (
                  <>
                    <span style={{ fontSize: 12, color: 'var(--brand-coral)', fontWeight: 600 }}>
                      <AlertTriangle
                        size={13}
                        style={{ verticalAlign: 'middle', marginRight: 3 }}
                      />
                      Confirm?
                    </span>
                    <button
                      className="secondary-button"
                      style={{ fontSize: 12, padding: '5px 14px' }}
                      onClick={() => setConfirmKill(false)}
                    >
                      Cancel
                    </button>
                  </>
                )}
                <button
                  onClick={toggleKillswitch}
                  disabled={killswitchPending}
                  style={{
                    padding: '9px 20px',
                    borderRadius: 12,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                    border: 0,
                    color: 'white',
                    background: settings.killswitch_active
                      ? 'var(--success)'
                      : 'var(--brand-coral)',
                    opacity: killswitchPending ? 0.6 : 1,
                    transition: 'all 150ms',
                  }}
                >
                  {killswitchPending
                    ? 'Working…'
                    : settings.killswitch_active
                      ? 'Resume agents'
                      : confirmKill
                        ? 'Yes, stop all agents'
                        : 'Stop all agents'}
                </button>
              </div>
            </div>
          </Card>

          {/* Models */}
          <SectionHeader
            title="Model routing"
            description="Which LLM handles planning vs. execution. Change via environment variables and restart the server."
          />
          <Card>
            <ModelField label="Plan" value={settings.model_plan} />
            <ModelField label="Execute" value={settings.model_execute} />
          </Card>

          {/* Integrations */}
          <SectionHeader
            title="Integrations"
            description="Service credentials are read from environment variables at startup."
          />
          <Card>
            <StatusBadge ok={settings.github_configured} label="GitHub OAuth" />
            <StatusBadge ok={settings.e2b_configured} label="E2B sandbox (CommitGuard)" />
            {settings.commitguard_webhook && (
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                CommitGuard webhook:{' '}
                <code style={{ color: 'var(--ink)' }}>{settings.commitguard_webhook}</code>
              </div>
            )}
          </Card>

          {/* Observability */}
          <SectionHeader
            title="Observability"
            description="LLM tracing and prompt analytics. Set the relevant API keys to enable."
          />
          <Card>
            <StatusBadge ok={settings.traceloop_configured} label="Traceloop (OpenTelemetry)" />
            <StatusBadge ok={settings.langfuse_configured} label="Langfuse" />
          </Card>

          {/* Env hint */}
          <div
            style={{
              padding: '14px 18px',
              borderRadius: 16,
              background: 'rgba(232,185,74,.08)',
              color: 'var(--ink)',
              fontSize: 14,
              border: '1px solid rgba(232,185,74,.2)',
            }}
          >
            <strong>To change settings:</strong> edit your <code>.env</code> file (see{' '}
            <code>.env.example</code>) and restart the API server. All values except the killswitch
            are read at startup and cannot be changed at runtime.
          </div>
        </>
      )}
    </div>
  );
}
