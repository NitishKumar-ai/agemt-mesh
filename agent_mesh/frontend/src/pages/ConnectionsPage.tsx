import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Layers,
  Linkedin,
  PenTool,
  RefreshCw,
  Twitter,
  Unplug,
  XCircle,
  Cloud,
  Wrench,
  Github,
  Globe,
  Plus,
  MessageSquare,
  CreditCard,
  Target,
  Search,
  BarChart,
  PieChart,
  Activity,
  Server,
  Database,
  Users,
  CloudLightning,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { api } from '../lib/api';
import type { ConnectionInfo, ConnectorConfig, SocialPlatform } from '../lib/types';

const ICONS: Record<string, typeof PenTool> = {
  'pen-tool': PenTool,
  twitter: Twitter,
  linkedin: Linkedin,
  layers: Layers,
  cloud: Cloud,
  tool: Wrench,
  github: Github,
  globe: Globe,
  'message-square': MessageSquare,
  'credit-card': CreditCard,
  target: Target,
  search: Search,
  'bar-chart': BarChart,
  'pie-chart': PieChart,
  activity: Activity,
  server: Server,
  database: Database,
  users: Users,
  'cloud-lightning': CloudLightning,
};

const BRAND_ACCENTS = [
  { bg: 'rgba(255,77,139,.08)', fg: 'var(--brand-pink)' },
  { bg: 'rgba(184,164,237,.1)', fg: 'var(--brand-lavender)' },
  { bg: 'rgba(26,58,58,.06)', fg: 'var(--brand-teal)' },
  { bg: 'rgba(232,185,74,.1)', fg: 'var(--brand-ochre)' },
];

export function ConnectionsPage() {
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
    setLoading(true);
    try {
      const [availRes, activeRes] = await Promise.all([
        api.listAvailableConnectors(),
        api.listConnections(),
      ]);
      setAvailable(availRes.connectors);
      setActive(activeRes.connections);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load connections');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function connect() {
    if (!connectTarget) return;

    const provider = available.find((x) => x.provider_id === connectTarget);
    if (provider?.auth_type === 'oauth') {
      if (provider.provider_id === 'github') {
        window.location.assign('/api/github/connect');
        return;
      }
      setError('OAuth flow not implemented for this provider yet.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api.createConnection(connectTarget, config, metadata);
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

      {loading && <div className="empty-card">Loading connectors…</div>}

      {!loading && (
        <>
          {/* Active connections */}
          {active.length > 0 && (
            <>
              <h3 className="section-title">Active Connections</h3>
              <div className="connection-grid">
                {active.map((conn, i) => {
                  const provider = available.find((a) => a.provider_id === conn.provider_id);
                  return (
                    <ConnectionCard
                      key={conn.id}
                      connection={conn}
                      provider={provider}
                      accent={BRAND_ACCENTS[i % BRAND_ACCENTS.length]}
                      onDisconnect={() => disconnect(conn.id)}
                      deleting={deleting === conn.id}
                    />
                  );
                })}
              </div>
            </>
          )}

          {/* Available connectors by category */}
          {categories.map((cat) => (
            <div key={cat} style={{ marginBottom: 32 }}>
              <h3 className="section-title">{cat.charAt(0).toUpperCase() + cat.slice(1)}</h3>
              <div className="connection-grid">
                {available
                  .filter((a) => a.category === cat)
                  .map((a, i) => (
                    <AvailableCard
                      key={a.provider_id}
                      connector={a}
                      accent={BRAND_ACCENTS[i % BRAND_ACCENTS.length]}
                      onConnect={() => setConnectTarget(a.provider_id)}
                    />
                  ))}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Connect Modal */}
      {connectTarget && (
        <div className="modal-overlay" onClick={() => setConnectTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const c = available.find((x) => x.provider_id === connectTarget);
              const Icon = ICONS[c?.icon ?? ''] ?? PenTool;
              return (
                <>
                  <div className="modal-header">
                    <div
                      className="modal-icon"
                      style={{ background: 'rgba(26,58,58,.06)', color: 'var(--brand-teal)' }}
                    >
                      <Icon size={22} />
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
                      {c?.config_schema?.map((field) => (
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

                  <div className="form-group">
                    <label className="form-label">Display Name (optional)</label>
                    <input
                      className="form-input"
                      placeholder="e.g. Production Cluster"
                      value={metadata.name || ''}
                      onChange={(e) => setMetadata({ ...metadata, name: e.target.value })}
                    />
                  </div>

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
        .section-title {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 16px;
          letter-spacing: 1.5px;
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
          background: rgba(10,10,10,0.3);
          display: grid;
          place-Items: center;
          z-index: 100;
          backdrop-filter: blur(4px);
        }
        .modal-content {
          background: var(--canvas);
          border-radius: 24px;
          padding: 32px;
          width: 440px;
          max-width: 90vw;
          border: 1px solid var(--hairline);
          box-shadow: 0 20px 60px rgba(10,10,10,.12);
        }
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
  deleting,
}: {
  connection: ConnectionInfo;
  provider?: ConnectorConfig;
  accent: { bg: string; fg: string };
  onDisconnect: () => void;
  deleting: boolean;
}) {
  const Icon = ICONS[provider?.icon || ''] || PenTool;
  const name = connection.metadata.name || provider?.name || connection.provider_id;

  return (
    <article className="card">
      <div className="card-header">
        <div className="card-identity">
          <div className="card-icon" style={{ background: accent.bg, color: accent.fg }}>
            <Icon size={20} />
          </div>
          <div>
            <div className="card-title">{name}</div>
            <div className="card-subtitle">
              {provider?.name} • {connection.connector_type}
            </div>
          </div>
        </div>
        {connection.status === 'connected' ? (
          <CheckCircle2 size={18} color="var(--success)" />
        ) : (
          <XCircle size={18} color="var(--error)" />
        )}
      </div>

      <div className="card-footer">
        <span className="card-timestamp">
          Connected {new Date(connection.created_at).toLocaleDateString()}
        </span>
        <button className="disconnect-button" onClick={onDisconnect} disabled={deleting}>
          <Unplug size={12} /> {deleting ? 'Removing…' : 'Disconnect'}
        </button>
      </div>

      <style>{`
        .card {
          border: 1px solid var(--hairline);
          border-radius: 16px;
          background: var(--canvas);
          padding: 20px 22px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          transition: transform 150ms, box-shadow 150ms;
        }
        .card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(10,10,10,.06);
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
          width: 40px;
          height: 40px;
          border-radius: 12px;
          display: grid;
          place-items: center;
        }
        .card-title {
          font-weight: 600;
          font-size: 16px;
          letter-spacing: -0.2px;
        }
        .card-subtitle {
          font-size: 12px;
          color: var(--muted);
          text-transform: capitalize;
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
  onConnect,
}: {
  connector: ConnectorConfig;
  accent: { bg: string; fg: string };
  onConnect: () => void;
}) {
  const Icon = ICONS[connector.icon || ''] || PenTool;

  return (
    <article className="card available">
      <div className="card-header">
        <div className="card-identity">
          <div className="card-icon" style={{ background: accent.bg, color: accent.fg }}>
            <Icon size={20} />
          </div>
          <div className="card-title">{connector.name}</div>
        </div>
        <button className="primary-button compact" onClick={onConnect}>
          <Plus size={14} /> Connect
        </button>
      </div>
      <p className="card-description">{connector.description}</p>
      <style>{`
        .card.available {
          border: 1px dashed var(--hairline);
          opacity: 0.8;
        }
        .card.available:hover {
          opacity: 1;
          border-style: solid;
        }
        .card-description {
          font-size: 13px;
          color: var(--muted);
          line-height: 1.5;
          margin: 0;
        }
        .primary-button.compact {
          padding: 6px 12px;
          font-size: 12px;
          border-radius: 10px;
        }
      `}</style>
    </article>
  );
}
