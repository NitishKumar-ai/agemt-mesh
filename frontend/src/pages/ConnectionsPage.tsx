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

const BRAND_ACCENTS = [
  { bg: "rgba(255,77,139,.08)", fg: "var(--brand-pink)" },
  { bg: "rgba(184,164,237,.1)", fg: "var(--brand-lavender)" },
  { bg: "rgba(26,58,58,.06)", fg: "var(--brand-teal)" },
  { bg: "rgba(232,185,74,.1)", fg: "var(--brand-ochre)" },
];

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
                  fontWeight: 600,
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  marginBottom: 12,
                  letterSpacing: "1.5px",
                }}
              >
                Connected
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
                  gap: 16,
                  marginBottom: 32,
                }}
              >
                {connected.map((p, i) => (
                  <PlatformCard
                    key={p.id}
                    platform={p}
                    accent={BRAND_ACCENTS[i % BRAND_ACCENTS.length]}
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
                  fontWeight: 600,
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  marginBottom: 12,
                  letterSpacing: "1.5px",
                }}
              >
                Available
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
                  gap: 16,
                  marginBottom: 32,
                }}
              >
                {available.map((p, i) => (
                  <PlatformCard
                    key={p.id}
                    platform={p}
                    accent={BRAND_ACCENTS[i % BRAND_ACCENTS.length]}
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
            background: "rgba(10,10,10,0.3)",
            display: "grid",
            placeItems: "center",
            zIndex: 100,
            backdropFilter: "blur(4px)",
          }}
          onClick={() => {
            setConnectTarget(null);
            setError(null);
          }}
        >
          <div
            style={{
              background: "var(--canvas)",
              borderRadius: 24,
              padding: 32,
              width: 440,
              maxWidth: "90vw",
              border: "1px solid var(--hairline)",
              boxShadow: "0 20px 60px rgba(10,10,10,.12)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const p = platforms.find((x) => x.id === connectTarget);
              const Icon = ICONS[p?.icon ?? ""] ?? PenTool;
              const pIdx = platforms.indexOf(p!);
              const accent = BRAND_ACCENTS[pIdx >= 0 ? pIdx % BRAND_ACCENTS.length : 0];
              return (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      marginBottom: 24,
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 14,
                        background: accent.bg,
                        color: accent.fg,
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <Icon size={22} />
                    </div>
                    <div>
                      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, letterSpacing: "-0.3px" }}>Connect {p?.name}</h2>
                      <p
                        style={{
                          fontSize: 13,
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
                      fontWeight: 600,
                      marginBottom: 6,
                      color: "var(--muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    API Key
                  </label>
                  <div style={{ position: "relative", marginBottom: 14 }}>
                    <input
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={`Paste your ${p?.name} API key`}
                      style={{
                        width: "100%",
                        padding: "10px 38px 10px 14px",
                        borderRadius: 12,
                        border: "1px solid var(--hairline)",
                        fontSize: 14,
                        background: "var(--canvas)",
                        color: "var(--ink)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      style={{
                        position: "absolute",
                        right: 10,
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
                      fontWeight: 600,
                      marginBottom: 6,
                      color: "var(--muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
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
                      padding: "10px 14px",
                      borderRadius: 12,
                      border: "1px solid var(--hairline)",
                      fontSize: 14,
                      background: "var(--canvas)",
                      marginBottom: 14,
                      color: "var(--ink)",
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
                        gap: 5,
                        fontSize: 13,
                        color: "var(--brand-teal)",
                        marginBottom: 18,
                        textDecoration: "none",
                        fontWeight: 600,
                      }}
                    >
                      <ExternalLink size={12} /> Get your API key from{" "}
                      {p.name}
                    </a>
                  )}

                  {error && (
                    <div
                      style={{
                        padding: "10px 14px",
                        borderRadius: 12,
                        background: "rgba(239,68,68,.06)",
                        color: "var(--error)",
                        fontSize: 13,
                        fontWeight: 600,
                        marginBottom: 14,
                        border: "1px solid rgba(239,68,68,.2)",
                      }}
                    >
                      {error}
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
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
  accent,
  onConnect,
  onDisconnect,
  disconnecting,
}: {
  platform: SocialPlatform;
  accent: { bg: string; fg: string };
  onConnect?: () => void;
  onDisconnect?: () => void;
  disconnecting?: boolean;
}) {
  const Icon = ICONS[platform.icon] ?? PenTool;

  return (
    <article
      style={{
        border: `1px solid ${platform.connected ? "rgba(34,197,94,.2)" : "var(--hairline)"}`,
        borderRadius: 16,
        background: "var(--canvas)",
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        transition: "transform 150ms, box-shadow 150ms",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 30px rgba(10,10,10,.06)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: platform.connected
                ? "rgba(34,197,94,.08)"
                : accent.bg,
              color: platform.connected ? "var(--success)" : accent.fg,
              display: "grid",
              placeItems: "center",
            }}
          >
            <Icon size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16, letterSpacing: "-0.2px" }}>
              {platform.name}
            </div>
            {platform.connected && platform.username && (
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                @{platform.username}
              </div>
            )}
          </div>
        </div>
        {platform.connected ? (
          <CheckCircle2 size={18} color="var(--success)" />
        ) : (
          <XCircle size={16} color="var(--muted-soft)" />
        )}
      </div>

      <p
        style={{
          fontSize: 14,
          color: "var(--muted)",
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        {platform.description}
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        {platform.scopes.split(",").map((scope) => (
          <span
            key={scope}
            style={{
              padding: "3px 9px",
              borderRadius: 9999,
              fontSize: 10,
              fontWeight: 600,
              background: "var(--surface-card)",
              color: "var(--muted)",
              border: "1px solid var(--hairline)",
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
          borderTop: "1px solid var(--hairline)",
          paddingTop: 12,
          marginTop: 2,
        }}
      >
        {platform.connected && platform.connected_at ? (
          <span style={{ fontSize: 11, color: "var(--muted)" }}>
            Connected{" "}
            {new Date(platform.connected_at).toLocaleDateString()}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: "var(--muted-soft)" }}>
            Not connected
          </span>
        )}

        {platform.connected ? (
          <button
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "6px 14px",
              borderRadius: 12,
              border: "1px solid rgba(239,68,68,.2)",
              background: "rgba(239,68,68,.04)",
              color: "var(--error)",
              fontWeight: 600,
              fontSize: 12,
              cursor: "pointer",
              opacity: disconnecting ? 0.6 : 1,
              transition: "all 150ms",
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
              gap: 5,
              padding: "6px 14px",
              borderRadius: 12,
              border: 0,
              background: "var(--primary)",
              color: "var(--on-primary)",
              fontWeight: 600,
              fontSize: 12,
              cursor: "pointer",
              transition: "background 150ms",
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
