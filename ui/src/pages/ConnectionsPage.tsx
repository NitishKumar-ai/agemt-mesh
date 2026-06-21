import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  RefreshCw,
  Unplug,
  XCircle,
  Plus,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { ConnectorLogo } from '../components/ConnectorLogo';
import { PageHeader } from '../components/PageHeader';
import { api } from '../lib/api';
import type { ConnectionInfo, ConnectorConfig, SocialPlatform } from '../lib/types';

/**
 * Social and identity connectors ported from the Python social_studio
 * providers and the new ScaleKit connector. These aren't yet served by a
 * backend /connections/available registry, so they're merged in client-side
 * — `connect()` below special-cases their auth_type === 'oauth' the same
 * way it already does for GitHub.
 */
const STATIC_CONNECTORS: ConnectorConfig[] = [
  { provider_id: 'twitter', name: 'Twitter / X', description: 'Publish tweets and ingest mentions and replies.', category: 'social', icon: 'twitter', auth_type: 'oauth' },
  { provider_id: 'tiktok', name: 'TikTok', description: 'Publish videos and ingest your TikTok activity.', category: 'social', icon: 'video', auth_type: 'oauth' },
  { provider_id: 'youtube', name: 'YouTube', description: 'Upload videos and ingest channel activity.', category: 'social', icon: 'youtube', auth_type: 'oauth' },
];

const BRAND_ACCENTS = [
  { bg: 'rgba(255,77,139,.08)', fg: 'var(--brand-pink)' },
  { bg: 'rgba(184,164,237,.1)', fg: 'var(--brand-lavender)' },
  { bg: 'rgba(26,58,58,.06)', fg: 'var(--brand-teal)' },
  { bg: 'rgba(232,185,74,.1)', fg: 'var(--brand-ochre)' },
];

/**
 * Per-provider accent. Real brand hues make the logo chips feel native instead
 * of a rotating palette. Falls back to the rotating BRAND_ACCENTS for anything
 * not listed here.
 */
const PROVIDER_ACCENTS: Record<string, { bg: string; fg: string }> = {
  github: { bg: 'rgba(36,41,47,.08)', fg: 'var(--ink)' },
  gmail: { bg: 'rgba(234,67,53,.1)', fg: '#ea4335' },
  drive: { bg: 'rgba(16,137,62,.1)', fg: '#10893e' },
  slack: { bg: 'rgba(74,21,75,.08)', fg: '#611f69' },
  notion: { bg: 'rgba(0,0,0,.06)', fg: 'var(--ink)' },
  airtable: { bg: 'rgba(255,191,0,.12)', fg: '#f59e0b' },
  linkedin: { bg: 'rgba(10,102,194,.1)', fg: '#0a66c2' },
  twitter: { bg: 'rgba(0,0,0,.06)', fg: 'var(--ink)' },
  x: { bg: 'rgba(0,0,0,.06)', fg: 'var(--ink)' },
  instagram: { bg: 'rgba(225,48,108,.1)', fg: '#e1306c' },
  facebook: { bg: 'rgba(24,119,242,.1)', fg: '#1877f2' },
  threads: { bg: 'rgba(0,0,0,.06)', fg: 'var(--ink)' },
  tiktok: { bg: 'rgba(0,0,0,.06)', fg: 'var(--ink)' },
  youtube: { bg: 'rgba(255,0,0,.1)', fg: '#ff0000' },
  scalekit: { bg: 'rgba(99,102,241,.1)', fg: 'var(--brand-purple)' },
  openai: { bg: 'rgba(16,163,127,.1)', fg: '#10a37f' },
};

function accentFor(providerId: string, fallbackIndex: number): { bg: string; fg: string } {
  return PROVIDER_ACCENTS[providerId] ?? BRAND_ACCENTS[fallbackIndex % BRAND_ACCENTS.length];
}

const CATEGORY_LABELS: Record<string, string> = {
  development: 'Development',
  communication: 'Communication',
  collaboration: 'Collaboration',
  knowledge: 'Knowledge',
  database: 'Database',
  storage: 'Storage',
  social: 'Social',
  identity: 'Identity',
  ai: 'AI',
};

function prettyCategory(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1);
}

export function ConnectionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const justConnected = searchParams.get('connected');
  const [available, setAvailable] = useState<ConnectorConfig[]>([]);
  const [active, setActive] = useState<ConnectionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectTarget, setConnectTarget] = useState<string | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    console.log('[ConnectionsPage] load start');
    setLoading(true);
    setError(null);
    // All calls are independent — a missing/erroring source shouldn't hide the
    // others (connector registry, scalekit accounts, and social OAuth status).
    const [availRes, activeRes] = await Promise.allSettled([
      api.listAvailableConnectors(),
      api.listConnections(),
    ]);
    console.log('[ConnectionsPage] load settled', availRes.status, activeRes.status);

    const backendConnectors = availRes.status === 'fulfilled' ? availRes.value.connectors : [];
    const known = new Set(backendConnectors.map((c) => c.provider_id));
    const allConnectors = [
      ...backendConnectors,
      ...STATIC_CONNECTORS.filter((c) => !known.has(c.provider_id)),
    ];
    setAvailable(allConnectors);

    const connections = activeRes.status === 'fulfilled' ? activeRes.value.connections : [];
    setActive(connections);

    if (availRes.status === 'rejected' && activeRes.status === 'rejected') {
      setError('Failed to load connections');
    }
    console.log('[ConnectionsPage] load done');
    setLoading(false);
  }

  useEffect(() => {
    console.log('[ConnectionsPage] mount effect');
    void load();
  }, []);

  async function connect() {
    if (!connectTarget) return;

    const provider = available.find((x) => x.provider_id === connectTarget);
    if (provider?.auth_type === 'oauth') {
      startOAuth(provider);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api.createConnection({ provider_id: connectTarget, config, metadata });
      setConnectTarget(null);
      setConfig({});
      setMetadata({});
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setSaving(false);
    }
  }

  async function disconnect(id: string) {
    setDeleting(id);
    try {
      await api.deleteConnection(id);
      void load();
    } finally {
      setDeleting(null);
    }
  }

  function encodeReturnState(url: string): string {
    const base64 = btoa(url).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `return:${base64}`;
  }

  function startOAuth(provider: ConnectorConfig) {
    const scalekitPlatforms = ['github', 'gmail', 'slack', 'notion', 'airtable', 'drive', 'scalekit'];
    const socialPlatforms: SocialPlatform[] = [
      'linkedin', 'twitter', 'instagram', 'facebook', 'threads', 'tiktok', 'youtube',
    ];
    const returnUrl = `${window.location.origin}/admin/sources`;
    const state = encodeReturnState(returnUrl);

    if (socialPlatforms.includes(provider.provider_id as SocialPlatform)) {
      window.location.assign(
        `/api/social-studio/oauth/${provider.provider_id}/login?state=${encodeURIComponent(state)}`,
      );
      return;
    }
    if (scalekitPlatforms.includes(provider.provider_id)) {
      window.location.assign(
        `/api/social-studio/oauth/scalekit/${provider.provider_id}/login?state=${encodeURIComponent(state)}`,
      );
      return;
    }
    setError(`OAuth is not configured for ${provider.name}.`);
  }

  function reconnect(providerId: string) {
    const provider = available.find((x) => x.provider_id === providerId);
    if (provider) {
      startOAuth(provider);
    }
  }

  const categories = Array.from(new Set(available.map((a) => a.category)));

  return (
    <div className="page">
      <PageHeader
        eyebrow="Integrations"
        title="Connectors"
        description="Connect your infrastructure, tools, and social accounts to empower your agents."
        actions={
          <button className="secondary-button" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      {justConnected && (
        <div className="success-banner">
          <CheckCircle2 size={18} />
          <span>
            <strong>
              {available.find((c) => c.provider_id === justConnected)?.name ??
                justConnected.charAt(0).toUpperCase() + justConnected.slice(1)}
            </strong>{' '}
            was connected successfully. The account now appears under Active Connections.
          </span>
          <button
            className="success-banner__close"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete('connected');
              setSearchParams(next, { replace: true });
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {loading && (
        <div className="connection-grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card skeleton" aria-hidden="true">
              <div className="skeleton-row">
                <div className="skeleton-chip" />
                <div className="skeleton-lines">
                  <div className="skeleton-line wide" />
                  <div className="skeleton-line" />
                </div>
              </div>
              <div className="skeleton-line full" />
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <>
          {/* Active connections */}
          <section className="section-block">
            <div className="section-heading">
              <h3 className="section-title">Active Connections</h3>
              {active.length > 0 && <span className="count-badge">{active.length}</span>}
            </div>

            {active.length > 0 ? (
              <div className="connection-grid">
                {active.map((conn, i) => {
                  const provider = available.find((a) => a.provider_id === conn.provider_id);
                  return (
                    <ConnectionCard
                      key={conn.id}
                      connection={conn}
                      provider={provider}
                      accent={accentFor(conn.provider_id, i)}
                      onDisconnect={() => disconnect(conn.id)}
                      onReconnect={() => reconnect(conn.provider_id)}
                      deleting={deleting === conn.id}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state__icon">
                  <Unplug size={22} />
                </div>
                <div>
                  <div className="empty-state__title">No active connections yet</div>
                  <div className="empty-state__text">
                    Connect a source below to start ingesting evidence into your company brain.
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Available connectors by category */}
          <section className="section-block">
            <div className="section-heading">
              <h3 className="section-title">Available Connectors</h3>
              <span className="count-badge subtle">{available.length}</span>
            </div>

            {categories.map((cat) => {
              const items = available.filter((a) => a.category === cat);
              if (items.length === 0) return null;
              return (
                <div key={cat} className="category-block">
                  <div className="category-label">{prettyCategory(cat)}</div>
                  <div className="connection-grid">
                    {items.map((a, i) => (
                      <AvailableCard
                        key={a.provider_id}
                        connector={a}
                        accent={accentFor(a.provider_id, i)}
                        connected={active.some((c) => c.provider_id === a.provider_id)}
                        onConnect={() => setConnectTarget(a.provider_id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        </>
      )}

      {/* Connect Modal */}
      {connectTarget && (
        <div className="modal-overlay" onClick={() => setConnectTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const c = available.find((x) => x.provider_id === connectTarget);
              return (
                <>
                  <div className="modal-header">
                    <div
                      className="modal-icon"
                      style={{
                        background: accentFor(c?.provider_id ?? '', 0).bg,
                        color: accentFor(c?.provider_id ?? '', 0).fg,
                      }}
                    >
                      <ConnectorLogo
                        providerId={c?.provider_id ?? ''}
                        icon={c?.icon}
                        size={24}
                      />
                    </div>
                    <div>
                      <h2 className="modal-title">Connect {c?.name}</h2>
                      <p className="modal-description">{c?.description}</p>
                    </div>
                  </div>

                  {c?.auth_type === 'oauth' ? (
                    <div style={{ textAlign: 'center', marginBottom: 20 }}>
                      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 15 }}>
                        This connection uses OAuth. You will be redirected to the provider to
                        authorize access.
                      </p>
                    </div>
                  ) : (
                    <>
                      {c?.config_schema?.map((field: any) => (
                        <div className="form-group" key={field.name}>
                          <label className="form-label">{field.label}</label>
                          {field.type === 'textarea' ? (
                            <textarea
                              className="form-input"
                              placeholder={field.placeholder}
                              required={field.required}
                              rows={4}
                              value={config[field.name] || ''}
                              onChange={(e) =>
                                setConfig({ ...config, [field.name]: e.target.value })
                              }
                            />
                          ) : (
                            <div style={{ position: 'relative' }}>
                              <input
                                className="form-input"
                                type={field.type === 'password' && showKey ? 'text' : field.type}
                                placeholder={field.placeholder}
                                required={field.required}
                                value={config[field.name] || ''}
                                onChange={(e) =>
                                  setConfig({ ...config, [field.name]: e.target.value })
                                }
                                style={field.type === 'password' ? { paddingRight: 38 } : {}}
                              />
                              {field.type === 'password' && (
                                <button
                                  type="button"
                                  onClick={() => setShowKey(!showKey)}
                                  style={{
                                    position: 'absolute',
                                    right: 10,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'none',
                                    border: 0,
                                    cursor: 'pointer',
                                    color: 'var(--muted)',
                                    padding: 2,
                                  }}
                                >
                                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </>
                  )}


                  {error && <div className="error-box">{error}</div>}

                  <div className="modal-actions">
                    <button className="secondary-button" onClick={() => setConnectTarget(null)}>
                      Cancel
                    </button>
                    <button className="primary-button" disabled={saving} onClick={connect}>
                      {saving ? 'Connecting…' : 'Connect'}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      <style>{`
        .success-banner {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 18px;
          border-radius: 16px;
          background: rgba(34, 197, 94, 0.08);
          border: 1px solid rgba(34, 197, 94, 0.2);
          color: var(--success);
          margin-bottom: 24px;
          font-size: 14px;
          animation: slideDown 0.3s ease-out;
        }
        @keyframes slideDown {
          from { transform: translateY(-10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .success-banner strong {
          font-weight: 600;
        }
        .success-banner__close {
          margin-left: auto;
          background: none;
          border: none;
          color: var(--success);
          font-size: 20px;
          line-height: 1;
          cursor: pointer;
          padding: 0 4px;
        }
        .section-block {
          margin-bottom: 40px;
        }
        .section-heading {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 18px;
        }
        .section-title {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--muted);
          margin: 0;
          letter-spacing: 1.5px;
        }
        .count-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 22px;
          height: 22px;
          padding: 0 7px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          color: white;
          background: linear-gradient(135deg, var(--brand-blue), var(--brand-purple));
        }
        .count-badge.subtle {
          color: var(--muted);
          background: var(--hairline);
        }
        .category-block {
          margin-bottom: 26px;
        }
        .category-label {
          font-size: 13px;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 12px;
          opacity: 0.78;
        }
        .empty-state {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 24px 26px;
          border-radius: 20px;
          border: 1px dashed var(--hairline);
          background: linear-gradient(145deg, rgba(184,164,237,.04), transparent);
        }
        .empty-state__icon {
          width: 48px;
          height: 48px;
          flex-shrink: 0;
          border-radius: 14px;
          display: grid;
          place-items: center;
          color: var(--brand-lavender);
          background: rgba(184,164,237,.12);
        }
        .empty-state__title {
          font-weight: 600;
          font-size: 15px;
          color: var(--ink);
          margin-bottom: 3px;
        }
        .empty-state__text {
          font-size: 13px;
          color: var(--muted);
          line-height: 1.5;
        }
        .skeleton {
          pointer-events: none;
        }
        .skeleton-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .skeleton-chip {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          flex-shrink: 0;
        }
        .skeleton-lines {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .skeleton-line {
          height: 11px;
          width: 60%;
          border-radius: 6px;
        }
        .skeleton-line.wide { width: 80%; }
        .skeleton-line.full { width: 100%; margin-top: 4px; }
        .skeleton-chip,
        .skeleton-line {
          background: linear-gradient(
            90deg,
            var(--hairline) 25%,
            rgba(0,0,0,0.04) 37%,
            var(--hairline) 63%
          );
          background-size: 400% 100%;
          animation: shimmer 1.4s ease infinite;
        }
        @keyframes shimmer {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
        .connection-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 16px;
          margin-bottom: 32px;
        }
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.4);
          display: grid;
          place-items: center;
          z-index: 100;
          backdrop-filter: blur(8px);
          animation: fadeIn 0.2s ease-out;
        }
        .modal-content {
          background: var(--canvas);
          border-radius: 24px;
          padding: 32px;
          width: 440px;
          max-width: 90vw;
          border: 1px solid rgba(255,255,255,0.1);
          box-shadow: 0 24px 80px rgba(0,0,0,.2);
          animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .modal-header {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 24px;
        }
        .modal-icon {
          width: 44px;
          height: 44px;
          border-radius: 14px;
          display: grid;
          place-items: center;
        }
        .modal-title {
          margin: 0;
          font-size: 18px;
          font-weight: 500;
          letter-spacing: -0.3px;
        }
        .modal-description {
          font-size: 13px;
          color: var(--muted);
          margin: 0;
        }
        .form-group {
          margin-bottom: 14px;
        }
        .form-label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 6px;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .form-input {
          width: 100%;
          padding: 10px 14px;
          border-radius: 12px;
          border: 1px solid var(--hairline);
          font-size: 14px;
          background: var(--canvas);
          color: var(--ink);
        }
        .error-box {
          padding: 10px 14px;
          border-radius: 12px;
          background: rgba(239,68,68,.06);
          color: var(--error);
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 14px;
          border: 1px solid rgba(239,68,68,.2);
        }
        .modal-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 24px;
        }
      `}</style>
    </div>
  );
}

function ConnectionCard({
  connection,
  provider,
  accent,
  onDisconnect,
  onReconnect,
  deleting,
}: {
  connection: ConnectionInfo;
  provider?: ConnectorConfig;
  accent: { bg: string; fg: string };
  onDisconnect: () => void;
  onReconnect: () => void;
  deleting: boolean;
}) {
  const name = provider?.name || connection.metadata.name || connection.provider_id;
  const account = connection.metadata.account || connection.metadata.name;
  const isConnected = connection.status === 'connected';

  return (
    <article className="card">
      <div className="card-header">
        <div className="card-identity">
          <div className="card-icon" style={{ background: accent.bg, color: accent.fg }}>
            <ConnectorLogo
              providerId={connection.provider_id}
              icon={provider?.icon}
              size={24}
            />
          </div>
          <div>
            <div className="card-title">{name}</div>
            <div className="card-subtitle">
              {account ? account : connection.connector_type}
            </div>
          </div>
        </div>
        {isConnected ? (
          <span className="status-pill status-pill--ok">
            <CheckCircle2 size={12} /> Connected
          </span>
        ) : (
          <span className="status-pill status-pill--warn">
            <XCircle size={12} /> Expired
          </span>
        )}
      </div>

      <div className="card-footer">
        <span className="card-timestamp">
          Connected {new Date(connection.created_at).toLocaleDateString()}
        </span>
        <div className="card-actions">
          <button className="reconnect-button" onClick={onReconnect}>
            <RefreshCw size={12} /> Reconnect
          </button>
          <button className="disconnect-button" onClick={onDisconnect} disabled={deleting}>
            <Unplug size={12} /> {deleting ? 'Removing…' : 'Disconnect'}
          </button>
        </div>
      </div>

      <style>{`
        .card {
          border: 1px solid rgba(0,0,0,0.08);
          border-radius: 20px;
          background: linear-gradient(145deg, var(--canvas), rgba(255,255,255,0.02));
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 4px 12px rgba(0,0,0,0.02);
        }
        [data-theme='dark'] .card {
          border: 1px solid rgba(255,255,255,0.05);
        }
        .card:hover {
          transform: translateY(-4px) scale(1.01);
          box-shadow: 0 12px 40px rgba(0,0,0,.08);
          border-color: rgba(0,0,0,0.12);
        }
        [data-theme='dark'] .card:hover {
          border-color: rgba(255,255,255,0.1);
        }
        .card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .card-identity {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .card-icon {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          transition: transform 0.2s;
        }
        .card:hover .card-icon {
          transform: scale(1.1) rotate(-3deg);
        }
        .card-title {
          font-weight: 700;
          font-size: 17px;
          letter-spacing: -0.3px;
          color: var(--ink);
        }
        .card-subtitle {
          font-size: 12px;
          color: var(--muted);
        }
        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
        }
        .status-pill--ok {
          color: var(--success);
          background: rgba(34,197,94,.1);
        }
        .status-pill--warn {
          color: var(--brand-ochre);
          background: rgba(232,185,74,.14);
        }
        .card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-top: 1px solid var(--hairline);
          padding-top: 12px;
          margin-top: 8px;
        }
        .card-timestamp {
          font-size: 11px;
          color: var(--muted);
        }
        .card-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .reconnect-button {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 6px 14px;
          border-radius: 12px;
          border: 1px solid rgba(59, 130, 246, .2);
          background: rgba(59, 130, 246, .06);
          color: var(--brand-blue);
          font-weight: 600;
          font-size: 12px;
          cursor: pointer;
          transition: all 150ms;
        }
        .reconnect-button:hover {
          background: rgba(59, 130, 246, .12);
        }
        .disconnect-button {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 6px 14px;
          border-radius: 12px;
          border: 1px solid rgba(239,68,68,.2);
          background: rgba(239,68,68,.04);
          color: var(--error);
          font-weight: 600;
          font-size: 12px;
          cursor: pointer;
          transition: all 150ms;
        }
      `}</style>
    </article>
  );
}

function AvailableCard({
  connector,
  accent,
  connected,
  onConnect,
}: {
  connector: ConnectorConfig;
  accent: { bg: string; fg: string };
  connected?: boolean;
  onConnect: () => void;
}) {
  return (
    <article className={`card available${connected ? ' is-connected' : ''}`}>
      <div className="card-header">
        <div className="card-identity">
          <div className="card-icon" style={{ background: accent.bg, color: accent.fg }}>
            <ConnectorLogo providerId={connector.provider_id} icon={connector.icon} size={24} />
          </div>
          <div className="card-title">{connector.name}</div>
        </div>
        {connected ? (
          <button className="ghost-button" onClick={onConnect} title="Manage connection">
            <CheckCircle2 size={14} /> Connected
          </button>
        ) : (
          <button className="primary-button compact" onClick={onConnect}>
            <Plus size={14} /> Connect
          </button>
        )}
      </div>
      <p className="card-description">{connector.description}</p>
      <style>{`
        .card.available {
          border: 1px dashed var(--hairline);
          background: transparent;
          box-shadow: none;
        }
        .card.available:hover {
          border-style: solid;
          transform: translateY(-3px);
          background: var(--canvas);
          box-shadow: 0 8px 30px rgba(0,0,0,.06);
        }
        .card.available.is-connected {
          border-style: solid;
          border-color: rgba(34,197,94,.25);
          background: rgba(34,197,94,.03);
        }
        .card-description {
          font-size: 14px;
          color: var(--muted);
          line-height: 1.6;
          margin: 0;
        }
        .primary-button.compact {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 600;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
          background: linear-gradient(135deg, var(--brand-blue), var(--brand-purple));
          color: white;
          border: none;
        }
        .primary-button.compact:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(99,102,241,0.3);
        }
        .ghost-button {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 600;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.15s;
          color: var(--success);
          background: rgba(34,197,94,.1);
          border: 1px solid rgba(34,197,94,.2);
        }
        .ghost-button:hover {
          background: rgba(34,197,94,.16);
        }
      `}</style>
    </article>
  );
}
