import { useEffect, useState } from "react";
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
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";
import type { SocialPlatform } from "../lib/types";

const ICONS: Record<string, typeof PenTool> = {
  "pen-tool": PenTool,
  twitter: Twitter,
  linkedin: Linkedin,
  layers: Layers,
};

export function ConnectionsPage() {
  const [platforms, setPlatforms] = useState<SocialPlatform[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectTarget, setConnectTarget] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [username, setUsername] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const FALLBACK_PLATFORMS: SocialPlatform[] = [
    { id: "typefully", name: "Typefully", description: "Schedule and publish to Twitter/X and LinkedIn via Typefully's API.", auth_type: "api_key", docs_url: "https://typefully.com/settings/api", icon: "pen-tool", scopes: "drafts,schedule,analytics", connected: false, username: null, connected_at: null },
    { id: "twitter", name: "Twitter / X", description: "Direct Twitter API access for posting and analytics.", auth_type: "api_key", docs_url: "https://developer.twitter.com/en/portal/dashboard", icon: "twitter", scopes: "tweet.read,tweet.write,users.read", connected: false, username: null, connected_at: null },
    { id: "linkedin", name: "LinkedIn", description: "Publish posts and articles to your LinkedIn profile or company page.", auth_type: "api_key", docs_url: "https://www.linkedin.com/developers/apps", icon: "linkedin", scopes: "w_member_social,r_liteprofile", connected: false, username: null, connected_at: null },
    { id: "buffer", name: "Buffer", description: "Multi-platform social scheduling via Buffer's publishing API.", auth_type: "api_key", docs_url: "https://buffer.com/developers/api", icon: "layers", scopes: "publish", connected: false, username: null, connected_at: null },
  ];

  async function load() {
    setLoading(true);
    try {
      const res = await api.listSocialPlatforms();
      setPlatforms(res.platforms);
    } catch {
      setPlatforms(FALLBACK_PLATFORMS);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function connect() {
    if (!connectTarget || !apiKey) return;
    setSaving(true);
    setError(null);
    try {
      await api.connectSocial(connectTarget, apiKey, username || undefined);
      setConnectTarget(null);
      setApiKey("");
      setUsername("");
      setShowKey(false);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect(platform: string) {
    setDisconnecting(platform);
    try {
      await api.disconnectSocial(platform);
      void load();
    } finally {
      setDisconnecting(null);
    }
  }

  useEffect(() => {
    if (!connectTarget) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setConnectTarget(null);
        setError(null);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [connectTarget]);

  const connected = platforms.filter((p) => p.connected);
  const available = platforms.filter((p) => !p.connected);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Integrations"
        title="Social Connections"
        description="Connect your social media accounts to let agents schedule and publish content."
        actions={
          <button className="secondary-button" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      {loading && <div className="empty-card">Loading platforms…</div>}

      {!loading && (
        <>
          {/* Connected platforms */}
          {connected.length > 0 && (
            <>
              <h3
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  marginBottom: 10,
                  letterSpacing: "0.04em",
                }}
              >
                Connected
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
                  gap: 14,
                  marginBottom: 28,
                }}
              >
                {connected.map((p) => (
                  <PlatformCard
                    key={p.id}
                    platform={p}
                    onDisconnect={() => disconnect(p.id)}
                    disconnecting={disconnecting === p.id}
                  />
                ))}
              </div>
            </>
          )}

          {/* Available platforms */}
          {available.length > 0 && (
            <>
              <h3
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  marginBottom: 10,
                  letterSpacing: "0.04em",
                }}
              >
                Available
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
                  gap: 14,
                  marginBottom: 28,
                }}
              >
                {available.map((p) => (
                  <PlatformCard
                    key={p.id}
                    platform={p}
                    onConnect={() => {
                      setConnectTarget(p.id);
                      setError(null);
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Connect modal */}
      {connectTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "grid",
            placeItems: "center",
            zIndex: 100,
          }}
          onClick={() => {
            setConnectTarget(null);
            setError(null);
          }}
        >
          <div
            style={{
              background: "var(--bg)",
              borderRadius: 16,
              padding: 28,
              width: 440,
              maxWidth: "90vw",
              border: "1px solid var(--border)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const p = platforms.find((x) => x.id === connectTarget);
              const Icon = ICONS[p?.icon ?? ""] ?? PenTool;
              return (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      marginBottom: 20,
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: "var(--primary-soft)",
                        color: "var(--primary)",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <Icon size={20} />
                    </div>
                    <div>
                      <h2 style={{ margin: 0 }}>Connect {p?.name}</h2>
                      <p
                        style={{
                          fontSize: 12,
                          color: "var(--muted)",
                          margin: 0,
                        }}
                      >
                        {p?.description}
                      </p>
                    </div>
                  </div>

                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 700,
                      marginBottom: 4,
                      color: "var(--muted)",
                    }}
                  >
                    API Key
                  </label>
                  <div style={{ position: "relative", marginBottom: 12 }}>
                    <input
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={`Paste your ${p?.name} API key`}
                      style={{
                        width: "100%",
                        padding: "8px 36px 8px 12px",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        fontSize: 13,
                        background: "var(--panel)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      style={{
                        position: "absolute",
                        right: 8,
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: 0,
                        cursor: "pointer",
                        color: "var(--muted)",
                        padding: 2,
                      }}
                    >
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>

                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 700,
                      marginBottom: 4,
                      color: "var(--muted)",
                    }}
                  >
                    Username (optional)
                  </label>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="@handle or display name"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      fontSize: 13,
                      background: "var(--panel)",
                      marginBottom: 12,
                    }}
                  />

                  {p?.docs_url && (
                    <a
                      href={p.docs_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 12,
                        color: "var(--primary)",
                        marginBottom: 16,
                        textDecoration: "none",
                      }}
                    >
                      <ExternalLink size={12} /> Get your API key from{" "}
                      {p.name}
                    </a>
                  )}

                  {error && (
                    <div
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        background: "rgba(221,78,78,0.08)",
                        color: "var(--error)",
                        fontSize: 12,
                        fontWeight: 600,
                        marginBottom: 12,
                        border: "1px solid rgba(221,78,78,0.2)",
                      }}
                    >
                      {error}
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setConnectTarget(null);
                        setError(null);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="primary-button"
                      disabled={!apiKey || saving}
                      onClick={connect}
                    >
                      {saving ? "Connecting…" : "Connect"}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

function PlatformCard({
  platform,
  onConnect,
  onDisconnect,
  disconnecting,
}: {
  platform: SocialPlatform;
  onConnect?: () => void;
  onDisconnect?: () => void;
  disconnecting?: boolean;
}) {
  const Icon = ICONS[platform.icon] ?? PenTool;

  return (
    <article
      style={{
        border: `1px solid ${platform.connected ? "var(--success)" : "var(--border)"}`,
        borderRadius: 12,
        background: "var(--panel)",
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: platform.connected
                ? "rgba(47,167,111,0.1)"
                : "var(--primary-soft)",
              color: platform.connected ? "var(--success)" : "var(--primary)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <Icon size={18} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {platform.name}
            </div>
            {platform.connected && platform.username && (
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                @{platform.username}
              </div>
            )}
          </div>
        </div>
        {platform.connected ? (
          <CheckCircle2 size={18} color="var(--success)" />
        ) : (
          <XCircle size={16} color="var(--subtle)" />
        )}
      </div>

      <p
        style={{
          fontSize: 13,
          color: "var(--muted)",
          lineHeight: 1.45,
          margin: 0,
        }}
      >
        {platform.description}
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 5,
        }}
      >
        {platform.scopes.split(",").map((scope) => (
          <span
            key={scope}
            style={{
              padding: "2px 7px",
              borderRadius: 6,
              fontSize: 10,
              fontWeight: 600,
              background: "var(--panel-soft)",
              color: "var(--muted)",
              border: "1px solid var(--border)",
            }}
          >
            {scope.trim()}
          </span>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: "1px solid var(--border)",
          paddingTop: 10,
          marginTop: 2,
        }}
      >
        {platform.connected && platform.connected_at ? (
          <span style={{ fontSize: 11, color: "var(--muted)" }}>
            Connected{" "}
            {new Date(platform.connected_at).toLocaleDateString()}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: "var(--subtle)" }}>
            Not connected
          </span>
        )}

        {platform.connected ? (
          <button
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 12px",
              borderRadius: 8,
              border: "1px solid var(--error)",
              background: "rgba(221,78,78,0.06)",
              color: "var(--error)",
              fontWeight: 700,
              fontSize: 11,
              cursor: "pointer",
              opacity: disconnecting ? 0.6 : 1,
            }}
            onClick={onDisconnect}
            disabled={disconnecting}
          >
            <Unplug size={12} /> {disconnecting ? "Removing…" : "Disconnect"}
          </button>
        ) : (
          <button
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 12px",
              borderRadius: 8,
              border: "1px solid var(--primary)",
              background: "var(--primary-soft)",
              color: "var(--primary)",
              fontWeight: 700,
              fontSize: 11,
              cursor: "pointer",
            }}
            onClick={onConnect}
          >
            Connect
          </button>
        )}
      </div>
    </article>
  );
}
