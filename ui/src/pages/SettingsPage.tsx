import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Gauge,
  Info,
  Monitor,
  Moon,
  OctagonX,
  Palette,
  Plug,
  ServerCog,
  ShieldOff,
  Sun,
  XCircle,
  Zap,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { api } from '../lib/api';
import type { AppSettings } from '../lib/types';
import {
  getPreferences,
  setPreferences,
  subscribePreferences,
  type InterfacePreferences,
  type ThemePreference,
} from '../lib/preferences';

type SectionKey =
  | 'appearance'
  | 'models'
  | 'integrations'
  | 'observability'
  | 'safety'
  | 'about';

const SECTIONS: { key: SectionKey; label: string; icon: typeof Palette }[] = [
  { key: 'appearance', label: 'Appearance', icon: Palette },
  { key: 'models', label: 'Models', icon: ServerCog },
  { key: 'integrations', label: 'Integrations', icon: Plug },
  { key: 'observability', label: 'Observability', icon: Gauge },
  { key: 'safety', label: 'Safety', icon: ShieldOff },
  { key: 'about', label: 'About', icon: Info },
];

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      {ok ? (
        <CheckCircle2 size={15} color="var(--success)" />
      ) : (
        <XCircle size={15} color="var(--muted)" />
      )}
      <span style={{ color: ok ? 'var(--success)' : 'var(--muted)', fontWeight: 600 }}>
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
        {value || '—'}
      </code>
      <p style={{ fontSize: 11, color: 'var(--muted-soft)', marginTop: 5 }}>
        Override via env var <code>MODEL_{label.replace(' ', '_').toUpperCase()}</code>
      </p>
    </div>
  );
}

/** Segmented multi-option control (used by the theme switcher). */
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon: typeof Sun }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        padding: 4,
        gap: 4,
        background: 'var(--surface-card)',
        border: '1px solid var(--hairline)',
        borderRadius: 12,
      }}
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '8px 16px',
              borderRadius: 9,
              border: 0,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              color: active ? 'var(--on-primary)' : 'var(--muted)',
              background: active ? 'var(--primary)' : 'transparent',
              transition: 'all 150ms',
            }}
          >
            <Icon size={15} />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Accessible on/off toggle. */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative',
        width: 44,
        height: 26,
        borderRadius: 999,
        border: 0,
        cursor: 'pointer',
        background: checked ? 'var(--primary)' : 'var(--surface-strong)',
        transition: 'background 150ms',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: checked ? 21 : 3,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,.25)',
          transition: 'left 150ms',
        }}
      />
    </button>
  );
}

function Row({
  title,
  description,
  control,
}: {
  title: string;
  description: string;
  control: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 20,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ maxWidth: 460 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{description}</div>
      </div>
      {control}
    </div>
  );
}

export function SettingsPage() {
  const [section, setSection] = useState<SectionKey>('appearance');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [killswitchPending, setKillswitchPending] = useState(false);
  const [confirmKill, setConfirmKill] = useState(false);

  // Interface preferences (theme/motion) — applied live, persisted locally.
  const [prefs, setPrefs] = useState<InterfacePreferences>(getPreferences());
  useEffect(() => subscribePreferences(setPrefs), []);

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
        description="Appearance, runtime configuration, and safety controls."
      />

      {/* Section navigation */}
      <div
        role="tablist"
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          marginBottom: 26,
          borderBottom: '1px solid var(--hairline)',
          paddingBottom: 14,
        }}
      >
        {SECTIONS.map(({ key, label, icon: Icon }) => {
          const active = section === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setSection(key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '8px 14px',
                borderRadius: 10,
                border: `1px solid ${active ? 'var(--hairline)' : 'transparent'}`,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                color: active ? 'var(--ink)' : 'var(--muted)',
                background: active ? 'var(--surface-card)' : 'transparent',
                transition: 'all 150ms',
              }}
            >
              <Icon size={15} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Appearance — fully client-side, no backend dependency */}
      {section === 'appearance' && (
        <>
          <SectionHeader
            title="Appearance"
            description="Personalize how the workspace looks on this device. Saved in your browser."
          />
          <Card>
            <Row
              title="Theme"
              description="Match your operating system, or lock to light or dark."
              control={
                <Segmented<ThemePreference>
                  value={prefs.theme}
                  onChange={(theme) => setPreferences({ theme })}
                  options={[
                    { value: 'system', label: 'System', icon: Monitor },
                    { value: 'light', label: 'Light', icon: Sun },
                    { value: 'dark', label: 'Dark', icon: Moon },
                  ]}
                />
              }
            />
            <div style={{ height: 1, background: 'var(--hairline)' }} />
            <Row
              title="Reduce motion"
              description="Minimize transitions and animations across the interface."
              control={
                <Toggle
                  label="Reduce motion"
                  checked={prefs.motion === 'reduced'}
                  onChange={(on) => setPreferences({ motion: on ? 'reduced' : 'full' })}
                />
              }
            />
          </Card>
        </>
      )}

      {loading && section !== 'appearance' && (
        <div className="empty-card">Loading settings…</div>
      )}
      {error && section !== 'appearance' && (
        <div className="empty-card" style={{ color: 'var(--muted)' }}>
          Could not load settings — the backend is not reachable.
        </div>
      )}

      {/* Models */}
      {section === 'models' && settings && (
        <>
          <SectionHeader
            title="Model routing"
            description="Which LLM handles planning vs. execution. Change via environment variables and restart the server."
          />
          <Card>
            <ModelField label="Plan" value={settings.model_plan} />
            <ModelField label="Execute" value={settings.model_execute} />
          </Card>
        </>
      )}

      {/* Integrations */}
      {section === 'integrations' && settings && (
        <>
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
        </>
      )}

      {/* Observability */}
      {section === 'observability' && settings && (
        <>
          <SectionHeader
            title="Observability"
            description="LLM tracing and prompt analytics. Set the relevant API keys to enable."
          />
          <Card>
            <StatusBadge ok={settings.traceloop_configured} label="Traceloop (OpenTelemetry)" />
            <StatusBadge ok={settings.langfuse_configured} label="Langfuse" />
          </Card>
        </>
      )}

      {/* Safety — emergency stop */}
      {section === 'safety' && settings && (
        <>
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
                flexWrap: 'wrap',
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
        </>
      )}

      {/* About */}
      {section === 'about' && (
        <>
          <SectionHeader
            title="About AgentMesh"
            description="A permission-aware temporal company brain backed by a durable workflow engine."
          />
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Zap size={22} color="var(--primary)" />
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>AgentMesh</div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  Local demo build · single-port runtime
                </div>
              </div>
            </div>
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
              <strong>To change server settings:</strong> edit your <code>.env</code> file (see{' '}
              <code>.env.example</code>) and restart the API server. Model routing, integrations, and
              observability are read at startup. Appearance and identity are applied instantly and
              stored in this browser.
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
