import { useState, useEffect, useRef } from "react";
import { api } from "../lib/api";
import { SSAccount, SSPlatformPost, SSPlatformMeta } from "../lib/types";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

export function SocialStudioPage() {
  const [activeTab, setActiveTab] = useState<"connections" | "generate" | "analytics" | "calendar" | "ideas">("connections");
  const [platforms, setPlatforms] = useState<Record<string, SSPlatformMeta>>({});
  const [accounts, setAccounts] = useState<SSAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [platsReq, acctsReq] = await Promise.all([
          api.ssPlatforms(),
          api.ssListAccounts()
        ]);
        setPlatforms(platsReq.platforms);
        setAccounts(acctsReq.accounts);
      } catch (err) {
        console.error("Failed to load Social Studio base data:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--canvas)", color: "var(--ink)", width: "100%", height: "100%", padding: "var(--sp-lg)" }}>
      <style>{`
        /* Tailwind Shim for Social Studio */
        .flex { display: flex; }
        .flex-col { flex-direction: column; }
        .flex-1 { flex: 1; }
        .items-center { align-items: center; }
        .justify-between { justify-content: space-between; }
        .justify-center { justify-content: center; }
        .gap-2 { gap: 8px; }
        .gap-4 { gap: 16px; }
        .gap-6 { gap: 24px; }
        .gap-8 { gap: 32px; }
        .space-y-4 > * + * { margin-top: 16px; }
        .space-y-6 > * + * { margin-top: 24px; }
        .space-y-8 > * + * { margin-top: 32px; }
        .space-x-2 > * + * { margin-left: 8px; }
        .w-full { width: 100%; }
        .max-w-md { max-width: 28rem; }
        .max-w-2xl { max-width: 42rem; }
        .max-w-4xl { max-width: 56rem; }
        .max-w-6xl { max-width: 72rem; }
        .h-full { height: 100%; }
        .p-2 { padding: 8px; }
        .p-4 { padding: 16px; }
        .p-6 { padding: 24px; }
        .pt-4 { padding-top: 16px; }
        .pb-2 { padding-bottom: 8px; }
        .px-4 { padding-left: 16px; padding-right: 16px; }
        .py-2 { padding-top: 8px; padding-bottom: 8px; }
        .mb-1 { margin-bottom: 4px; }
        .mb-2 { margin-bottom: 8px; }
        .mb-4 { margin-bottom: 16px; }
        .mb-6 { margin-bottom: 24px; }
        .bg-white { background: var(--surface-card); }
        .bg-slate-50 { background: var(--surface-soft); }
        .bg-slate-100 { background: #f0ebe1; }
        .bg-slate-200 { background: var(--surface-strong); }
        .text-slate-500 { color: var(--muted); }
        .text-slate-600 { color: var(--muted); }
        .text-blue-500 { color: var(--brand-teal); }
        .text-blue-600 { color: var(--brand-teal); }
        .text-red-500 { color: var(--error); }
        .text-green-500 { color: var(--success); }
        .text-white { color: white; }
        .border { border: 1px solid var(--hairline); }
        .border-b { border-bottom: 1px solid var(--hairline); }
        .rounded { border-radius: var(--r-sm); }
        .rounded-md { border-radius: var(--r-sm); }
        .rounded-lg { border-radius: var(--r-md); }
        .rounded-xl { border-radius: var(--r-xl); }
        .shadow { box-shadow: var(--shadow-sm); }
        .shadow-md { box-shadow: var(--shadow-md); }
        .shadow-xl { box-shadow: var(--shadow-lg); }
        .font-bold { font-weight: 600; }
        .font-semibold { font-weight: 600; }
        .font-medium { font-weight: 500; }
        .text-sm { font-size: 14px; }
        .text-xs { font-size: 12px; }
        .text-lg { font-size: 18px; }
        .text-xl { font-size: 20px; }
        .text-2xl { font-size: 24px; font-weight: 600; }
        .text-4xl { font-size: 32px; font-weight: 500; }
        .fixed { position: fixed; }
        .absolute { position: absolute; }
        .inset-0 { top: 0; left: 0; right: 0; bottom: 0; }
        .z-50 { z-index: 50; }
        .overflow-hidden { overflow: hidden; }
        .overflow-auto { overflow: auto; }
        .grid { display: grid; }
        .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .transition-colors { transition: background-color 0.2s, color 0.2s; }
        .hover\\:bg-slate-50:hover { background: var(--surface-strong); }
        .hover\\:bg-blue-50:hover { background: rgba(26,58,58,.06); }
        .hover\\:bg-blue-600:hover { background: #122a2a; }
        .hover\\:text-blue-700:hover { color: #122a2a; }
        .opacity-50 { opacity: 0.5; }
        .cursor-not-allowed { cursor: not-allowed; }
        .animate-spin { animation: spin 1s linear infinite; }
        .bg-black\\/50 { background: rgba(10, 10, 10, 0.5); }
        
        /* Fix the native inputs */
        input.border, select.border, textarea.border {
          background: var(--surface-card);
          border: 1px solid var(--hairline);
          padding: 8px 12px;
          border-radius: var(--r-sm);
          color: var(--ink);
          font-family: inherit;
        }
        input.border:focus, select.border:focus, textarea.border:focus {
          outline: none;
          border-color: var(--ink);
        }
        .rounded-full { border-radius: 9999px; }
        .rounded-2xl { border-radius: 24px; }
        .bg-primary { background: #0a0a0a; color: white; }
        .hover\:bg-primary-hover:hover { background: #3a3a3a; }
        .font-display { font-family: 'Inter', sans-serif; letter-spacing: -1px; font-weight: 500; font-size: 40px; }
        .font-title { font-family: 'Inter', sans-serif; letter-spacing: -0.3px; font-weight: 600; font-size: 24px; }
      `}</style>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display mb-1">Social Studio</h1>
          <p className="text-sm text-slate-500">Manage connections, generate content, and track performance.</p>
        </div>
        <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-full">
          {(["connections", "generate", "analytics", "calendar", "ideas"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "bg-white dark:bg-slate-700 shadow text-slate-900"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <span className="animate-spin text-4xl text-blue-500">⚙️</span>
          </div>
        ) : (
          <>
            {activeTab === "connections" && <ConnectionsTab accounts={accounts} platforms={platforms} reloadAccounts={async () => {
              const res = await api.ssListAccounts();
              setAccounts(res.accounts);
            }} />}
            {activeTab === "generate" && <GenerateTab platforms={platforms} accounts={accounts} />}
            {activeTab === "analytics" && <AnalyticsTab accounts={accounts} />}
            {activeTab === "calendar" && <CalendarTab />}
            {activeTab === "ideas" && <IdeasTab />}
          </>
        )}
      </div>
    </div>
  );
}

// ── Platform metadata for Connect page ──────────────────────────────────────

const PLATFORM_META: Record<string, { label: string; description: string; color: string; bg: string; icon: string }> = {
  linkedin:         { label: "LinkedIn (Personal)",   description: "Personal profile",              color: "#0a66c2", bg: "#e8f1fb", icon: "in" },
  linkedin_company: { label: "LinkedIn (Company)",    description: "Company Pages & analytics",     color: "#0a66c2", bg: "#e8f1fb", icon: "in" },
  instagram:        { label: "Instagram",              description: "Via Facebook Page (Business)",  color: "#e1306c", bg: "#fce4ef", icon: "📸" },
  instagram_login:  { label: "Instagram (Direct)",    description: "Professional account, no FB Page required", color: "#c13584", bg: "#f9e5f5", icon: "📷" },
  bluesky:          { label: "Bluesky",                description: "AT Protocol",                   color: "#0085ff", bg: "#e0f0ff", icon: "🦋" },
  threads:          { label: "Threads",                description: "Text & Media",                  color: "#000000", bg: "#f0f0f0", icon: "@" },
  twitter:          { label: "Twitter / X",            description: "Short-form posts",              color: "#1da1f2", bg: "#e8f6fe", icon: "𝕏" },
  facebook:         { label: "Facebook",               description: "Pages & Groups",                color: "#1877f2", bg: "#e7f3ff", icon: "f" },
  tiktok:           { label: "TikTok",                 description: "Short-form videos",             color: "#000000", bg: "#f0f0f0", icon: "🎵" },
  youtube:          { label: "YouTube",                description: "Videos & Shorts",               color: "#ff0000", bg: "#ffe5e5", icon: "▶" },
};

// ── Connections Tab ─────────────────────────────────────────────────────────

function ConnectionsTab({ accounts, platforms, reloadAccounts }: { accounts: SSAccount[], platforms: Record<string, SSPlatformMeta>, reloadAccounts: () => Promise<void> }) {
  const [view, setView] = useState<"list" | "connect" | "form">("list");
  const [selectedPlatform, setSelectedPlatform] = useState("");
  const [accountId, setAccountId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [companyPages, setCompanyPages] = useState<Array<{id:string;name:string;handle:string;access_token:string;picture?:string}> | null>(null);
  const [loadingPages, setLoadingPages] = useState(false);

  const handleHealthCheck = async (id: number) => {
    try { await api.ssHealthCheck(id); await reloadAccounts(); }
    catch (e) { alert("Health check failed"); }
  };

  const handleDisconnect = async (id: number) => {
    if (!confirm("Are you sure you want to disconnect this account?")) return;
    try { await api.ssDisconnectAccount(id); await reloadAccounts(); }
    catch (e) { console.error(e); }
  };

  const handlePlatformSelect = (pid: string) => {
    setSelectedPlatform(pid);
    setCompanyPages(null);
    if (pid === "linkedin" || pid === "linkedin_company") {
      // goes to OAuth view
    }
    setView("form");
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.ssConnectAccount({ platform: selectedPlatform, account_id: accountId, display_name: displayName, username, access_token: accessToken });
      await reloadAccounts();
      setView("list");
    } catch (err) { alert("Failed to connect: " + err); }
    finally { setLoading(false); }
  };

  const handleLoadCompanyPages = async () => {
    setLoadingPages(true);
    try { 
      const res = await api.ssLinkedInCompanyPages(); 
      setCompanyPages(res.pages); 
    }
    catch (err: any) { 
      const errorMsg = err?.message || String(err);
      if (errorMsg.includes("403") || errorMsg.includes("Forbidden")) {
        alert("LinkedIn API Permission Error:\n\nYour LinkedIn account or app doesn't have permission to access company pages. Please check:\n\n1. Reconnect your LinkedIn personal account to ensure all scopes are granted\n2. Verify your LinkedIn app has company page permissions enabled in the LinkedIn Developer Portal\n3. Make sure you're an admin of at least one company page");
      } else if (errorMsg.includes("No LinkedIn personal account")) {
        alert("Please connect your LinkedIn personal account first before accessing company pages.");
      } else {
        alert("Failed to load company pages:\n\n" + errorMsg);
      }
    }
    finally { setLoadingPages(false); }
  };

  const handleConnectCompanyPage = async (page: {id:string;name:string;handle:string;access_token:string;picture?:string}) => {
    setLoading(true);
    try {
      await api.ssConnectLinkedInCompany({ org_id: page.id, name: page.name, handle: page.handle, picture: page.picture, access_token: page.access_token });
      await reloadAccounts();
      setView("list");
    } catch (err) { alert("Failed: " + err); }
    finally { setLoading(false); }
  };

  const allPlatforms = Object.keys(PLATFORM_META);
  const isLinkedIn = selectedPlatform === "linkedin" || selectedPlatform === "linkedin_company";

  // ── Connect a Platform page ──
  if (view === "connect") {
    return (
      <div style={{ background: "var(--canvas)" }}>
        <style>{`
          .platform-card { background: #fff; border: 1.5px solid #f0ede8; border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 12px; transition: box-shadow 0.18s, border-color 0.18s; cursor: pointer; }
          .platform-card:hover { box-shadow: 0 4px 24px rgba(0,0,0,0.09); border-color: #e8b89a; }
          .connect-btn { display: flex; align-items: center; justify-content: center; gap: 6px; background: #fef3ec; color: #d4622a; border: 1.5px solid #f5c9a8; border-radius: 999px; padding: 9px 18px; font-size: 14px; font-weight: 600; width: 100%; transition: background 0.15s; cursor: pointer; }
          .connect-btn:hover { background: #fde8d8; }
          .platform-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; flex-shrink: 0; }
        `}</style>
        <button
          onClick={() => setView("list")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#666", fontSize: 14, cursor: "pointer", marginBottom: 24, fontWeight: 500 }}
        >
          ‹ Back to Social Accounts
        </button>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6, letterSpacing: "-0.5px" }}>Connect a Platform</h1>
        <p style={{ color: "#888", marginBottom: 32, fontSize: 15 }}>Select a platform to connect your social media account.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 18 }}>
          {allPlatforms.map(pid => {
            const meta = PLATFORM_META[pid];
            return (
              <div key={pid} className="platform-card" onClick={() => handlePlatformSelect(pid)}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div className="platform-icon" style={{ background: meta.bg, color: meta.color }}>
                    {meta.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a" }}>{meta.label}</div>
                    <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>{meta.description}</div>
                  </div>
                </div>
                <button className="connect-btn" onClick={e => { e.stopPropagation(); handlePlatformSelect(pid); }}>
                  Connect →
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Connect form / OAuth view ──
  if (view === "form") {
    const meta = PLATFORM_META[selectedPlatform] || { label: selectedPlatform, color: "#666", bg: "#eee", icon: "?", description: "" };
    const isLinkedIn = selectedPlatform === "linkedin" || selectedPlatform === "linkedin_company";
    const isOAuth = ["linkedin", "linkedin_company", "instagram", "instagram_login", "threads", "facebook", "twitter", "tiktok", "youtube"].includes(selectedPlatform);
    const isBluesky = selectedPlatform === "bluesky";
    
    return (
      <div style={{ maxWidth: 520 }}>
        <style>{`
          .connect-btn { display: flex; align-items: center; justify-content: center; gap: 6px; background: #fef3ec; color: #d4622a; border: 1.5px solid #f5c9a8; border-radius: 999px; padding: 12px 18px; font-size: 15px; font-weight: 600; width: 100%; transition: background 0.15s; cursor: pointer; }
          .connect-btn:hover { background: #fde8d8; }
          .field-input { width: 100%; border: 1.5px solid #e8e4df; border-radius: 12px; padding: 12px 14px; font-size: 15px; background: #faf9f7; outline: none; box-sizing: border-box; }
          .field-input:focus { border-color: #d4622a; }
        `}</style>
        <button onClick={() => setView("connect")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#666", fontSize: 14, cursor: "pointer", marginBottom: 24, fontWeight: 500 }}>
          ‹ Back to Connect a Platform
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: meta.bg, color: meta.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800 }}>{meta.icon}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 20 }}>{meta.label}</div>
            <div style={{ fontSize: 14, color: "#888" }}>{meta.description}</div>
          </div>
        </div>

        {isLinkedIn ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontSize: 14, color: "#666", lineHeight: 1.6 }}>Connect your LinkedIn account securely via OAuth. You&apos;ll be redirected to LinkedIn and back.</p>
            <button className="connect-btn" onClick={() => window.location.assign("/api/social-studio/oauth/linkedin/login")}
              style={{ background: "#0a66c2", color: "white", border: "none" }}>
              Log in with LinkedIn (Personal)
            </button>
            <div style={{ borderTop: "1.5px solid #f0ede8", paddingTop: 16 }}>
              <p style={{ fontSize: 14, color: "#888", marginBottom: 12 }}>Or connect a Company Page (requires LinkedIn personal connected):</p>
              <div style={{ background: "#fef9f5", border: "1.5px solid #fde8d8", borderRadius: 10, padding: "12px 14px", marginBottom: 12, fontSize: 13, color: "#666", lineHeight: 1.6 }}>
                <strong style={{ color: "#d4622a", display: "block", marginBottom: 4 }}>⚠️ Requirements:</strong>
                • Your LinkedIn personal account must be connected above<br/>
                • You must be an administrator of at least one company page<br/>
                • Your LinkedIn app needs organization scopes enabled in the LinkedIn Developer Portal
              </div>
              {!companyPages ? (
                <button className="connect-btn" onClick={handleLoadCompanyPages} disabled={loadingPages}>
                  {loadingPages ? "Loading..." : "Browse My Company Pages"}
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 260, overflowY: "auto" }}>
                  {companyPages.length === 0 && <p style={{ color: "#aaa", textAlign: "center", padding: "20px 0" }}>No company pages found.</p>}
                  {companyPages.map(page => (
                    <div key={page.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", border: "1.5px solid #f0ede8", borderRadius: 12, background: "#fff" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {page.picture && <img src={page.picture} style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover" }} />}
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{page.name}</div>
                          {page.handle && <div style={{ fontSize: 12, color: "#888" }}>/{page.handle}</div>}
                        </div>
                      </div>
                      <button onClick={() => handleConnectCompanyPage(page)} disabled={loading}
                        style={{ background: "#fef3ec", color: "#d4622a", border: "1.5px solid #f5c9a8", borderRadius: 999, padding: "6px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                        {loading ? "..." : "Connect"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : isOAuth && !isLinkedIn ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontSize: 14, color: "#666", lineHeight: 1.6 }}>
              Connect your {meta.label} account securely via OAuth. You&apos;ll be redirected to {meta.label} to authorize access.
            </p>
            <button 
              className="connect-btn" 
              onClick={() => window.location.assign(`/api/social-studio/oauth/${selectedPlatform}/login`)}
              style={{ background: meta.color, color: "white", border: "none" }}>
              Connect with {meta.label} →
            </button>
          </div>
        ) : isBluesky ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "#e0f0ff", border: "1.5px solid #99d5ff", borderRadius: 10, padding: "12px 14px", marginBottom: 8, fontSize: 13, color: "#0066cc", lineHeight: 1.6 }}>
              <strong style={{ display: "block", marginBottom: 4 }}>ℹ️ Bluesky uses App Passwords</strong>
              1. Go to Settings → App Passwords in Bluesky<br/>
              2. Create a new app password<br/>
              3. Enter your handle and app password below
            </div>
            <form onSubmit={handleFormSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div><label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#444" }}>Handle (e.g., username.bsky.social)</label>
                <input className="field-input" placeholder="username.bsky.social" value={username} onChange={e => setUsername(e.target.value)} required /></div>
              <div><label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#444" }}>App Password</label>
                <input className="field-input" type="password" placeholder="xxxx-xxxx-xxxx-xxxx" value={accessToken} onChange={e => setAccessToken(e.target.value)} required /></div>
              <button className="connect-btn" type="submit" disabled={loading} style={{ marginTop: 8 }}>
                {loading ? "Connecting..." : "Connect →"}
              </button>
            </form>
          </div>
        ) : (
          <form onSubmit={handleFormSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div><label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#444" }}>Account ID</label>
              <input className="field-input" value={accountId} onChange={e => setAccountId(e.target.value)} required /></div>
            <div><label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#444" }}>Display Name</label>
              <input className="field-input" value={displayName} onChange={e => setDisplayName(e.target.value)} required /></div>
            <div><label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#444" }}>Username / Handle</label>
              <input className="field-input" value={username} onChange={e => setUsername(e.target.value)} /></div>
            <div><label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#444" }}>Access Token / App Password</label>
              <input className="field-input" type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} required /></div>
            <button className="connect-btn" type="submit" disabled={loading} style={{ marginTop: 8 }}>
              {loading ? "Connecting..." : "Connect →"}
            </button>
          </form>
        )}
      </div>
    );
  }

  // ── Connected accounts list ──
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="font-title">Connected Accounts</h2>
        <button
          onClick={() => setView("connect")}
          style={{ background: "#fef3ec", color: "#d4622a", border: "1.5px solid #f5c9a8", borderRadius: 999, padding: "9px 22px", fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "background 0.15s" }}
          onMouseEnter={e => (e.currentTarget.style.background = "#fde8d8")}
          onMouseLeave={e => (e.currentTarget.style.background = "#fef3ec")}
        >
          + Connect Account
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {accounts.map(acct => {
          const meta = PLATFORM_META[acct.platform] || { label: acct.platform, color: "#666", bg: "#eee", icon: acct.platform.charAt(0).toUpperCase(), description: "" };
          return (
            <div key={acct.id} style={{ background: "#fff", border: "1.5px solid #f0ede8", borderRadius: 16, padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {acct.avatar_url ? (
                  <img src={acct.avatar_url} alt={acct.display_name} style={{ width: 48, height: 48, borderRadius: 12, objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: meta.bg, color: meta.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800 }}>
                    {meta.icon}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{acct.display_name}</div>
                  <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>@{acct.username || acct.platform}</div>
                </div>
                <div style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: meta.bg, color: meta.color, whiteSpace: "nowrap" }}>{meta.label}</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ background: "#faf9f7", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 11, color: "#aaa", marginBottom: 3 }}>Followers</div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{(acct.follower_count || 0).toLocaleString()}</div>
                </div>
                <div style={{ background: "#faf9f7", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 11, color: "#aaa", marginBottom: 3 }}>Status</div>
                  <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 5, color: acct.status === "active" ? "#22c55e" : "#ef4444" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: acct.status === "active" ? "#22c55e" : "#ef4444", display: "inline-block" }} />
                    {acct.status}
                  </div>
                </div>
              </div>

              <div style={{ borderTop: "1.5px solid #f5f3f0", paddingTop: 12, display: "flex", justifyContent: "space-between" }}>
                <button onClick={() => handleHealthCheck(acct.id)} style={{ background: "none", border: "none", color: "#d4622a", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Re-sync</button>
                <button onClick={() => handleDisconnect(acct.id)} style={{ background: "none", border: "none", color: "#aaa", fontSize: 13, cursor: "pointer" }}>Disconnect</button>
              </div>
            </div>
          );
        })}
        {accounts.length === 0 && (
          <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "48px 0", color: "#bbb", border: "2px dashed #ece8e2", borderRadius: 16, fontSize: 15 }}>
            No accounts connected yet. Click <strong style={{ color: "#d4622a" }}>+ Connect Account</strong> to start.
          </div>
        )}
      </div>
    </div>
  );
}


// ── Generate Tab ────────────────────────────────────────────────────────────

type PublishProofItem = {
  platform: string;
  label: string;
  success: boolean;
  url?: string;
  externalPostId?: string;
  dbPostId?: number;
  error?: string;
  publishedAt?: string;
};

type PublishProof = {
  topic: string;
  runId?: string;
  completedAt: string;
  items: PublishProofItem[];
};

function formatProofTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function PublishProofBanner({
  proof,
  onDismiss,
}: {
  proof: PublishProof;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const published = proof.items.filter(i => i.success);
  const failed = proof.items.filter(i => !i.success);
  const allOk = published.length > 0 && failed.length === 0;

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      alert("Could not copy — select the link manually.");
    }
  };

  return (
    <div
      style={{
        borderRadius: 20,
        border: `2px solid ${allOk ? "#22c55e" : failed.length && !published.length ? "#ef4444" : "#e8b94a"}`,
        background: allOk ? "rgba(34,197,94,0.08)" : failed.length && !published.length ? "rgba(239,68,68,0.06)" : "rgba(232,185,74,0.08)",
        padding: "20px 24px",
        marginTop: 20,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: published.length ? 16 : 0 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>
            {allOk ? "✓ Published live" : published.length ? "Partially published" : "Publish failed"}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            Topic: <span style={{ color: "var(--ink)", fontWeight: 500 }}>{proof.topic}</span>
            {" · "}
            {formatProofTime(proof.completedAt)}
            {proof.runId && (
              <> · Run <code style={{ fontSize: 11, background: "var(--surface-soft)", padding: "2px 6px", borderRadius: 4 }}>{proof.runId.slice(0, 12)}…</code></>
            )}
          </div>
        </div>
        <button type="button" onClick={onDismiss} className="ss-secondary-btn" style={{ padding: "6px 12px", fontSize: 12, flexShrink: 0 }}>
          Dismiss
        </button>
      </div>

      {published.map(item => (
        <div
          key={item.platform}
          style={{
            background: "#fff",
            border: "1px solid rgba(34,197,94,0.35)",
            borderRadius: 14,
            padding: "16px 18px",
            marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#15803d" }}>
              {item.label} — confirmed on platform
            </div>
            {item.url && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    background: "#0a66c2",
                    color: "#fff",
                    padding: "10px 18px",
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  Open live post ↗
                </a>
                <button
                  type="button"
                  className="ss-secondary-btn"
                  style={{ padding: "10px 14px", fontSize: 13 }}
                  onClick={() => copyLink(item.url!)}
                >
                  {copied === item.url ? "Copied!" : "Copy link"}
                </button>
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, fontSize: 12, color: "var(--muted)" }}>
            {item.externalPostId && (
              <div>
                <span style={{ fontWeight: 600 }}>Platform ID</span>
                <div style={{ fontFamily: "monospace", fontSize: 11, wordBreak: "break-all", color: "var(--ink)", marginTop: 2 }}>
                  {item.externalPostId}
                </div>
              </div>
            )}
            {item.dbPostId != null && item.dbPostId > 0 && (
              <div>
                <span style={{ fontWeight: 600 }}>Studio record</span>
                <div style={{ color: "var(--ink)", marginTop: 2 }}>Post #{item.dbPostId}</div>
              </div>
            )}
            {item.publishedAt && (
              <div>
                <span style={{ fontWeight: 600 }}>Published at</span>
                <div style={{ color: "var(--ink)", marginTop: 2 }}>{formatProofTime(item.publishedAt)}</div>
              </div>
            )}
          </div>
        </div>
      ))}

      {failed.map(item => (
        <div
          key={item.platform + (item.error || "")}
          style={{
            background: "#fff",
            border: "1px solid rgba(239,68,68,0.35)",
            borderRadius: 14,
            padding: "14px 18px",
            marginBottom: 8,
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 700, color: "#b91c1c", marginBottom: 4 }}>{item.label} — not published</div>
          <div style={{ color: "var(--muted)" }}>{item.error || "Unknown error"}</div>
        </div>
      ))}
    </div>
  );
}


// ── Image Generation Section ────────────────────────────────────────────────

function ImageGenerationSection() {
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<{file_id: string; file_path: string; width: number; height: number} | null>(null);
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError("Please enter a prompt");
      return;
    }
    if (prompt.length > 1000) {
      setError("Prompt too long (max 1000 characters)");
      return;
    }

    setGenerating(true);
    setError("");
    setGeneratedImage(null);

    try {
      const res = await api.ssImagenGenerate({ prompt: prompt.trim() });
      setGeneratedImage(res);
    } catch (err: any) {
      setError(err?.message || "Failed to generate image");
    } finally {
      setGenerating(false);
    }
  };

  const handleClear = () => {
    setPrompt("");
    setGeneratedImage(null);
    setError("");
  };

  return (
    <div className="ss-gen-card" style={{ marginBottom: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 className="font-title" style={{ marginBottom: 6 }}>✨ AI Image Generation</h2>
        <p style={{ fontSize: 14, color: "var(--muted)" }}>
          Generate images with Google Imagen 3 — powered by gemini-3.1-flash-image
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: generatedImage ? "1fr 1fr" : "1fr", gap: 20 }}>
        <div>
          <label className="ss-gen-label">Image Prompt</label>
          <textarea
            className="ss-gen-textarea"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Describe the image you want to generate... (e.g., 'A serene mountain landscape at sunset with vibrant colors')"
            style={{ minHeight: generatedImage ? 200 : 120 }}
            disabled={generating}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <span style={{ fontSize: 12, color: prompt.length > 1000 ? "#ef4444" : "var(--muted)" }}>
              {prompt.length} / 1000 characters
            </span>
            {generatedImage && (
              <button
                onClick={handleClear}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--muted)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Clear & Start Over
              </button>
            )}
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating || !prompt.trim() || prompt.length > 1000}
            style={{
              marginTop: 16,
              width: "100%",
              background: generating ? "var(--surface-strong)" : "#7c3aed",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "14px 20px",
              fontSize: 15,
              fontWeight: 600,
              cursor: generating ? "not-allowed" : "pointer",
              opacity: generating || !prompt.trim() ? 0.6 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10
            }}
          >
            {generating ? (
              <><span style={{ animation: "spin 1s linear infinite" }}>⚙️</span> Generating Image...</>
            ) : (
              <>🎨 Generate Image</>
            )}
          </button>

          {error && (
            <div style={{
              marginTop: 12,
              padding: "12px 16px",
              background: "rgba(239,68,68,0.1)",
              border: "1px solid #ef4444",
              borderRadius: 10,
              color: "#ef4444",
              fontSize: 13
            }}>
              {error}
            </div>
          )}
        </div>

        {generatedImage && (
          <div>
            <label className="ss-gen-label">Generated Image</label>
            <div style={{
              border: "2px solid var(--hairline)",
              borderRadius: 16,
              overflow: "hidden",
              background: "#f9fafb"
            }}>
              <img
                src={`/api/social-studio/media/${generatedImage.file_id}`}
                alt="Generated"
                style={{ width: "100%", display: "block" }}
              />
            </div>
            <div style={{
              marginTop: 12,
              padding: "10px 14px",
              background: "rgba(124,58,237,0.1)",
              borderRadius: 10,
              fontSize: 12,
              color: "var(--muted)"
            }}>
              <strong style={{ color: "#7c3aed" }}>✓ Ready to use</strong>
              <br />
              Dimensions: {generatedImage.width} × {generatedImage.height}px
              <br />
              File ID: <code style={{ fontSize: 11 }}>{generatedImage.file_id}</code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Generate Tab ────────────────────────────────────────────────────────────

function GenerateTab({ platforms, accounts }: { platforms: Record<string, SSPlatformMeta>, accounts: SSAccount[] }) {
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("professional");
  const [brandVoice, setBrandVoice] = useState("");
  const connectedKeys = accounts.map(a => a.platform);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(connectedKeys);
  const [generating, setGenerating] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleInterval, setScheduleInterval] = useState("daily");
  const [generateImage, setGenerateImage] = useState(true);
  const [runId, setRunId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, SSPlatformPost>>({});
  const [agentResults, setAgentResults] = useState<Array<{
    platform: string;
    success?: boolean;
    url?: string;
    error?: string;
    caption_preview?: string;
    content?: string;
    step?: string;
    post_id?: number;
    platform_post_id?: string;
    external_post_id?: string;
    published_at?: string;
    image_url?: string;
  }>>([]);
  const [publishProof, setPublishProof] = useState<PublishProof | null>(null);
  const [agentLogs, setAgentLogs] = useState<Array<{event: string, agent: string, message: string}>>([]);
  const proofRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (connectedKeys.length) {
      setSelectedPlatforms(prev => {
        const next = connectedKeys.filter(p => p in platforms);
        return next.length ? next : prev;
      });
    }
  }, [accounts.length]);

  useEffect(() => {
    if (publishProof?.items.some(i => i.success) && proofRef.current) {
      proofRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [publishProof]);

  const publishablePlatforms = selectedPlatforms.filter(p =>
    accounts.some(a => a.platform === p)
  );

  const buildAccountMap = () => {
    const accountMap: Record<string, number> = {};
    publishablePlatforms.forEach(p => {
      const acct = accounts.find(a => a.platform === p);
      if (acct) accountMap[p] = acct.id;
    });
    return accountMap;
  };

  const buildProofFromResults = (
    results: typeof agentResults,
    meta: { topic: string; runId?: string; completedAt?: string },
  ): PublishProof => ({
    topic: meta.topic,
    runId: meta.runId,
    completedAt: meta.completedAt || new Date().toISOString(),
    items: results.map(r => ({
      platform: r.platform,
      label: platforms[r.platform]?.label ?? (r.platform === "all" ? "Agent" : r.platform),
      success: !!r.success,
      url: r.url,
      externalPostId: r.external_post_id || r.platform_post_id,
      dbPostId: r.post_id,
      error: r.error,
      publishedAt: r.published_at || meta.completedAt,
    })),
  });

  const handleAgentRun = async () => {
    if (!topic.trim()) return alert("Enter a topic first");
    if (!publishablePlatforms.length) {
      return alert("Connect at least one account for your selected platforms (Connections tab).");
    }
    setAgentRunning(true);
    setPublishProof(null);
    setAgentResults(publishablePlatforms.map(p => ({ platform: p, step: "writing" })));
    setDrafts({});
    try {
      const res = await api.ssAutopost({
        topic: topic.trim(),
        tone,
        brand_voice: brandVoice,
        platforms: publishablePlatforms,
        account_map: buildAccountMap(),
        publish_now: true,
      });
      setRunId(res.run_id);
      setAgentResults(res.results);
      setPublishProof(buildProofFromResults(res.results, {
        topic: res.topic,
        runId: res.run_id,
        completedAt: new Date().toISOString(),
      }));
      const draftMap: Record<string, SSPlatformPost> = {};
      res.results.forEach(r => {
        if (r.caption_preview || r.content) {
          draftMap[r.platform] = {
            id: r.post_id || 0,
            platform: r.platform,
            caption: r.content || r.caption_preview || "",
            content: r.content || r.caption_preview || "",
            hashtags: "",
            char_count: (r.content || r.caption_preview || "").length,
            status: r.success ? "published" : "failed",
            platform_post_url: r.url,
            image_url: r.image_url,
          } as SSPlatformPost;
        }
      });
      setDrafts(draftMap);
    } catch (err: any) {
      const msg = err?.message || String(err);
      const failResults = [{ platform: "all", success: false, error: msg, step: "failed" }];
      setAgentResults(failResults);
      setPublishProof(buildProofFromResults(failResults, { topic: topic.trim() }));
    } finally {
      setAgentRunning(false);
    }
  };

  const handleScheduleAutoPost = async () => {
    if (!topic.trim()) return alert("Topic is required");
    if (!publishablePlatforms.length) return alert("Connect at least one platform first.");
    setScheduling(true);
    try {
      await api.ssAutopostSchedule({
        topic: topic.trim(),
        interval: scheduleInterval,
        name: `Multi-platform (${publishablePlatforms.join(", ")})`,
      });
      alert(`Agent scheduled! Will auto-post about this topic ${scheduleInterval}.`);
    } catch (err: any) {
      alert("Failed to schedule: " + (err?.message || err));
    } finally {
      setScheduling(false);
    }
  };

  const handleGenerate = async () => {
    if (!topic) return alert("Topic is required");
    if (!selectedPlatforms.length) return alert("Select at least one platform");
    setGenerating(true);
    setRunId(null);
    setDrafts({});
    setAgentResults([]);
    setPublishProof(null);
    setAgentLogs([]);
    try {
      const accountMap = buildAccountMap();
      const res = await api.ssGenerate({ topic, tone, brand_voice: brandVoice, platforms: selectedPlatforms, account_map: accountMap });
      setRunId(res.run_id);

      const params = new URLSearchParams({
        topic, tone, brand_voice: brandVoice,
        platforms: selectedPlatforms.join(","),
        account_map: JSON.stringify(accountMap),
        generate_image: generateImage ? "true" : "false",
      });
      const es = new EventSource(`/api/social-studio/generate/${res.run_id}/stream?${params.toString()}`);

      const logs: any[] = [];
      es.addEventListener("agent_status", (e) => {
        const data = JSON.parse(e.data);
        logs.push(data);
        setAgentLogs([...logs]);
      });
      es.addEventListener("media_done", (e) => {
        const data = JSON.parse(e.data);
        setDrafts(prev => {
          const next = { ...prev };
          Object.keys(next).forEach(k => {
            next[k] = { ...next[k], image_url: data.image_url };
          });
          return next;
        });
      });
      es.addEventListener("platform_done", (e) => {
        const data = JSON.parse(e.data);
        setDrafts(prev => ({ ...prev, [data.platform]: data }));
      });
      es.addEventListener("complete", () => {
        setGenerating(false);
        es.close();
        loadRunPosts(res.run_id);
      });
      es.addEventListener("error", () => {
        setGenerating(false);
        es.close();
      });
    } catch (err) {
      console.error(err);
      alert("Failed to start generation");
      setGenerating(false);
    }
  };

  const loadRunPosts = async (rid: string) => {
    try {
      const res = await api.ssGetRun(rid);
      const postMap: Record<string, SSPlatformPost> = {};
      res.posts.forEach(p => { postMap[p.platform] = p; });
      setDrafts(postMap);
    } catch (e) {
      console.error(e);
    }
  };

  const publishPost = async (postId: number, platformKey: string) => {
    try {
      const res = await api.ssPublishPost(postId);
      const label = platforms[platformKey]?.label ?? platformKey;
      if (res.success) {
        setPublishProof({
          topic: topic.trim() || "Draft post",
          completedAt: new Date().toISOString(),
          items: [{
            platform: platformKey,
            label,
            success: true,
            url: res.url,
            externalPostId: res.platform_post_id,
            dbPostId: postId,
            publishedAt: new Date().toISOString(),
          }],
        });
        setDrafts(prev => ({
          ...prev,
          [platformKey]: {
            ...prev[platformKey],
            status: "published",
            platform_post_url: res.url,
          } as SSPlatformPost,
        }));
      } else {
        alert("Publish failed: " + (res.error || "Unknown error"));
      }
      if (runId) loadRunPosts(runId);
    } catch (e: any) {
      alert("Publish failed: " + (e?.message || e));
    }
  };

  const successCount = agentResults.filter(r => r.success).length;
  const failCount = agentResults.filter(r => r.success === false).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, height: "100%" }}>
      <style>{`
        .ss-gen-card { background: var(--surface-card); border: 1px solid var(--hairline); border-radius: 24px; padding: 28px; }
        .ss-gen-label { font-size: 13px; font-weight: 600; color: var(--muted); margin-bottom: 8px; display: block; }
        .ss-gen-input, .ss-gen-select, .ss-gen-textarea {
          width: 100%; background: var(--surface-soft); border: 1px solid var(--hairline);
          border-radius: 12px; padding: 12px 14px; font-size: 15px; color: var(--ink); font-family: inherit;
        }
        .ss-gen-textarea { min-height: 96px; resize: vertical; }
        .ss-gen-input:focus, .ss-gen-select:focus, .ss-gen-textarea:focus { outline: none; border-color: var(--ink); }
        .ss-platform-chip {
          display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px;
          font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px solid var(--hairline); transition: all 0.15s;
        }
        .ss-platform-chip.on { background: #f0ebe1; border-color: var(--ink); color: var(--ink); }
        .ss-platform-chip.off { background: var(--surface-soft); color: var(--muted); opacity: 0.55; }
        .ss-platform-chip.disconnected { opacity: 0.35; cursor: not-allowed; }
        .ss-agent-cta {
          background: #0a0a0a; color: #fff; border: none; border-radius: 12px; padding: 14px 28px;
          font-size: 15px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 10px;
          transition: background 0.15s, transform 0.15s;
        }
        .ss-agent-cta:hover:not(:disabled) { background: #3a3a3a; transform: translateY(-1px); }
        .ss-agent-cta:disabled { opacity: 0.45; cursor: not-allowed; }
        .ss-secondary-btn {
          background: var(--surface-soft); border: 1px solid var(--hairline); border-radius: 12px;
          padding: 12px 20px; font-size: 14px; font-weight: 600; cursor: pointer; color: var(--ink);
        }
        .ss-agent-pipeline {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; margin-top: 20px;
        }
        .ss-agent-step {
          background: var(--surface-soft); border: 1px solid var(--hairline); border-radius: 16px; padding: 16px;
        }
        .ss-agent-step.done { border-color: #22c55e; background: rgba(34,197,94,0.06); }
        .ss-agent-step.fail { border-color: #ef4444; background: rgba(239,68,68,0.06); }
        .ss-agent-step.active { border-color: #b8a4ed; background: rgba(184,164,237,0.08); }
        .ss-draft-card {
          background: var(--surface-card); border: 1px solid var(--hairline); border-radius: 16px;
          display: flex; flex-direction: column; overflow: hidden; min-height: 280px;
        }
      `}</style>

      {/* War Room + Draft Cards rendered below */}

      <div className="ss-gen-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
          <div>
            <h2 className="font-title" style={{ marginBottom: 6 }}>Agent Mesh Publisher</h2>
            <p style={{ fontSize: 14, color: "var(--muted)", maxWidth: 520 }}>
              One click — each connected platform gets its own agent: writes native copy, then publishes live.
            </p>
          </div>
          {agentResults.length > 0 && !agentRunning && (
            <div style={{ display: "flex", gap: 12, fontSize: 13, fontWeight: 600 }}>
              {successCount > 0 && <span style={{ color: "#22c55e" }}>{successCount} published</span>}
              {failCount > 0 && <span style={{ color: "#ef4444" }}>{failCount} failed</span>}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label className="ss-gen-label">Topic / Brief — or paste a URL to research</label>
            <textarea
              className="ss-gen-textarea"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. Why durable agents beat brittle task queues — or paste https://... to research it"
              style={{ minHeight: 80 }}
            />
          </div>
          <div>
            <label className="ss-gen-label">Tone</label>
            <select className="ss-gen-select" value={tone} onChange={e => setTone(e.target.value)}>
              <option value="professional">Professional</option>
              <option value="casual">Casual & Witty</option>
              <option value="educational">Educational</option>
              <option value="urgent">Urgent & Exciting</option>
            </select>
          </div>
          <div>
            <label className="ss-gen-label">Brand Voice (optional)</label>
            <input
              className="ss-gen-input"
              value={brandVoice}
              onChange={e => setBrandVoice(e.target.value)}
              placeholder="Technical, no fluff, founder voice…"
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0" }}>
            <button
              type="button"
              onClick={() => setGenerateImage(!generateImage)}
              style={{
                width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer", position: "relative",
                background: generateImage ? "#7c3aed" : "var(--surface-strong)",
                transition: "background 0.2s",
                flexShrink: 0,
              }}
              aria-label="Toggle image generation"
            >
              <span style={{
                position: "absolute", top: 3, left: generateImage ? 21 : 3,
                width: 16, height: 16, borderRadius: "50%", background: "#fff",
                transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)"
              }} />
            </button>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Generate AI Image</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>Art Director agent auto-creates a matching visual via Imagen 3</div>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label className="ss-gen-label">Platforms — agents run in parallel</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(platforms).map(([k, v]) => {
              const connected = accounts.some(a => a.platform === k);
              const on = selectedPlatforms.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  disabled={!connected}
                  className={`ss-platform-chip ${on ? "on" : "off"} ${!connected ? "disconnected" : ""}`}
                  onClick={() => {
                    if (!connected) return;
                    setSelectedPlatforms(on ? selectedPlatforms.filter(p => p !== k) : [...selectedPlatforms, k]);
                  }}
                  title={connected ? v.label : `${v.label} — connect in Connections tab`}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: v.color }} />
                  {v.label}
                  {!connected && " (not connected)"}
                </button>
              );
            })}
          </div>
          {!publishablePlatforms.length && (
            <p style={{ fontSize: 13, color: "#ef4444", marginTop: 10 }}>
              No connected accounts for selected platforms. Go to Connections and link LinkedIn first.
            </p>
          )}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, paddingTop: 20, borderTop: "1px solid var(--hairline)" }}>
          <button
            className="ss-agent-cta"
            onClick={handleAgentRun}
            disabled={agentRunning || generating || !publishablePlatforms.length || !topic.trim()}
          >
            {agentRunning ? (
              <><span style={{ animation: "spin 1s linear infinite" }}>⚙</span> Agents working…</>
            ) : (
              <>✦ Generate & Publish All</>
            )}
          </button>
          <button
            className="ss-agent-cta"
            onClick={handleGenerate}
            disabled={generating || agentRunning || !selectedPlatforms.length}
          >
            {generating ? "Agents Working..." : "Deploy Campaign Team"}
          </button>
          <select
            className="ss-gen-select"
            style={{ width: "auto", minWidth: 120 }}
            value={scheduleInterval}
            onChange={e => setScheduleInterval(e.target.value)}
            disabled={scheduling || agentRunning}
          >
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <button
            className="ss-secondary-btn"
            onClick={handleScheduleAutoPost}
            disabled={scheduling || agentRunning || !publishablePlatforms.length}
          >
            {scheduling ? "Scheduling…" : "Schedule recurring"}
          </button>
        </div>

        {publishProof && !agentRunning && (
          <div ref={proofRef}>
            <PublishProofBanner proof={publishProof} onDismiss={() => setPublishProof(null)} />
          </div>
        )}

        {(agentRunning || (agentResults.length > 0 && !publishProof)) && (
          <div className="ss-agent-pipeline">
            {(agentRunning ? publishablePlatforms : agentResults.map(r => r.platform)).map(p => {
              const meta = platforms[p] || { label: p, color: "#666" };
              const result = agentResults.find(r => r.platform === p);
              const active = agentRunning && !result;
              const done = result?.success;
              const fail = result && result.success === false;
              return (
                <div key={p} className={`ss-agent-step ${done ? "done" : fail ? "fail" : active ? "active" : ""}`}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: meta.color }} />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{meta.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    {active && "Writing → Publishing…"}
                    {done && (
                      <>
                        <span style={{ color: "#15803d", fontWeight: 600 }}>Live on {meta.label} ✓</span>
                        {result?.url && (
                          <a href={result.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#0a66c2", marginTop: 6, display: "block", fontWeight: 600 }}>
                            Verify on platform ↗
                          </a>
                        )}
                      </>
                    )}
                    {fail && (result?.error || "Failed")}
                    {result && !active && !done && !fail && "Queued"}
                  </div>
                  {result?.url && !done && (
                    <a href={result.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#0a66c2", marginTop: 6, display: "block" }}>
                      View post →
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {generating && (
        <div style={{ background: "#0a0a0a", border: "1px solid #333", borderRadius: 16, padding: 20, marginBottom: 24, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, maxHeight: 250, overflowY: "auto", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.5)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, borderBottom: "1px dashed #333", paddingBottom: 12 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, background: "#22c55e", borderRadius: "50%", boxShadow: "0 0 10px #22c55e" }} />
            <span style={{ color: "#fff", fontWeight: 700, letterSpacing: 1 }}>AGENT WAR ROOM</span>
            <span style={{ color: "#666", fontSize: 11, marginLeft: "auto" }}>MULTI-AGENT PIPELINE</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {agentLogs.length === 0 ? (
              <div style={{ color: "#555" }}>Booting agent framework...</div>
            ) : (
              agentLogs.map((log, i) => {
                let color = "#8b5cf6"; // Coordinator
                if (log.agent === "Researcher") color = "#3b82f6";
                else if (log.agent === "Strategist") color = "#eab308";
                else if (log.agent === "Copywriter") color = "#10b981";
                else if (log.agent === "Editor") color = "#ef4444";
                else if (log.agent === "Art Director") color = "#ec4899";
                
                return (
                  <div key={i} style={{ display: "flex", gap: 12, lineHeight: 1.4 }}>
                    <span style={{ color, fontWeight: 700, minWidth: 110, flexShrink: 0 }}>[{log.agent}]</span>
                    <span style={{ color: "#e2e8f0" }}>{log.message}</span>
                  </div>
                );
              })
            )}
            <div ref={(el) => el && el.scrollIntoView()} />
          </div>
        </div>
      )}

      {(Object.keys(drafts).length > 0 || generating) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16, paddingBottom: 24 }}>
          {(generating ? selectedPlatforms : Object.keys(drafts)).map(p => {
            const meta = platforms[p] || { label: p, color: "#666", char_limit: 280 };
            const draft = drafts[p];
            const isLoading = generating && !draft;
            return (
              <div key={p} className="ss-draft-card">
                <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--hairline)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface-soft)" }}>
                  <span style={{ fontWeight: 600, color: meta.color }}>{meta.label}</span>
                  {draft && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: draft.char_count > meta.char_limit ? "#fee2e2" : "var(--surface-strong)" }}>
                      {draft.char_count}/{meta.char_limit}
                    </span>
                  )}
                </div>
                <div style={{ flex: 1, padding: 16, fontSize: 14, lineHeight: 1.55, overflow: "auto", whiteSpace: "pre-wrap", position: "relative" }}>
                  {isLoading ? (
                    <div style={{ textAlign: "center", color: "var(--muted)", paddingTop: 40 }}>Agent writing…</div>
                  ) : draft ? (
                    <>
                      {draft.image_url && (
                        <div style={{ margin: "-16px -16px 16px -16px", background: "#000" }}>
                          <img 
                            src={draft.image_url} 
                            alt="Generated content" 
                            style={{ 
                              width: "100%", 
                              maxHeight: p.includes("instagram") ? 400 : 280,
                              objectFit: "cover",
                              display: "block"
                            }} 
                          />
                        </div>
                      )}
                      <div style={{ fontFamily: ["twitter", "threads", "instagram", "instagram_login"].includes(p) ? "system-ui, -apple-system, sans-serif" : "inherit" }}>
                        {draft.caption || draft.content}
                      </div>
                      {draft.hashtags && <div style={{ color: p.includes("instagram") ? "#00376b" : "#0a66c2", marginTop: 12 }}>{draft.hashtags}</div>}
                    </>
                  ) : null}
                </div>
                {draft?.id ? (
                  <div style={{ padding: "10px 16px", borderTop: "1px solid var(--hairline)", display: "flex", flexDirection: "column", gap: 8 }}>
                    {draft.status === "published" && draft.platform_post_url ? (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#15803d" }}>Published — live on {meta.label}</span>
                        </div>
                        <a
                          href={draft.platform_post_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: "block",
                            textAlign: "center",
                            background: "#0a66c2",
                            color: "#fff",
                            padding: "10px 14px",
                            borderRadius: 10,
                            fontSize: 13,
                            fontWeight: 600,
                            textDecoration: "none",
                          }}
                        >
                          Open live post ↗
                        </a>
                      </>
                    ) : (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)" }}>{draft.status}</span>
                        {(draft.status === "draft" || draft.status === "failed") && (
                          <button onClick={() => publishPost(draft.id, p)} className="ss-secondary-btn" style={{ padding: "6px 12px", fontSize: 12 }}>
                            Publish
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ── Analytics Tab ───────────────────────────────────────────────────────────

const PLATFORM_COLORS: Record<string, string> = {
  threads:          "#000000",
  facebook:         "#1877f2",
  instagram:        "#e1306c",
  instagram_login:  "#c13584",
  linkedin:         "#0a66c2",
  linkedin_company: "#0a66c2",
  twitter:          "#1da1f2",
  bluesky:          "#0085ff",
  tiktok:           "#ff0050",
  youtube:          "#ff0000",
};

const METRIC_CHIPS = [
  { key: "followers",   label: "Audience"     },
  { key: "impressions", label: "Impressions"  },
  { key: "reach",       label: "Reach"        },
  { key: "engagements", label: "Engagements"  },
];

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function fmtDelta(delta: number): { sign: string; color: string } {
  if (delta > 0)  return { sign: `+${fmtNum(delta)}`, color: "#10b981" };
  if (delta < 0)  return { sign: fmtNum(delta),        color: "#ef4444" };
  return           { sign: "—",                         color: "#94a3b8" };
}


function AnalyticsTab({ accounts }: { accounts: SSAccount[] }) {
  const [summary, setSummary]             = useState<any>(null);
  const [timeseries, setTimeseries]       = useState<any[]>([]);
  const [posts, setPosts]                 = useState<any[]>([]);
  const [loading, setLoading]             = useState(true);
  const [syncing, setSyncing]             = useState(false);
  const [activeMetric, setActiveMetric]   = useState("followers");
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (selectedAccount !== null) loadTimeseries();
  }, [selectedAccount, activeMetric]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [sumRes, postsRes] = await Promise.all([
        api.ssAnalyticsSummary(),
        api.ssAnalyticsPosts(20),
      ]);
      setSummary(sumRes);
      setPosts(postsRes.posts);
      if (sumRes.accounts?.length > 0) {
        setSelectedAccount(sumRes.accounts[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadTimeseries = async () => {
    if (selectedAccount === null) return;
    try {
      const res = await api.ssAnalyticsTimeseries(selectedAccount, activeMetric, 30);
      // Reshape [{date, value}] for recharts
      const shaped = (res.data || []).map((d: any) => ({ date: d.date?.slice(5), value: d.value }));
      setTimeseries(shaped);
    } catch (e) {
      console.error("timeseries error", e);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.ssAnalyticsSync();
      await loadAll();
    } catch (e) {
      console.error(e);
      alert("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "300px", flexDirection: "column", gap: 12, color: "#64748b" }}>
      <div style={{ fontSize: 28 }}>📊</div>
      <div style={{ fontSize: 14, fontWeight: 500 }}>Loading Analytics…</div>
    </div>
  );
  if (!summary) return <div style={{ padding: 32, color: "#ef4444" }}>Error loading analytics</div>;

  const totals = summary.totals || {};
  const kpis = [
    { label: "Total Audience",    key: "followers",   icon: "👥" },
    { label: "Total Impressions", key: "impressions", icon: "👁️" },
    { label: "Total Reach",       key: "reach",       icon: "📡" },
    { label: "Total Engagements", key: "engagements", icon: "💬" },
  ];

  const activeColor = "#6366f1";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <style>{`
        .an-card { background: var(--surface-card, #fff); border: 1px solid var(--border, #e2e8f0); border-radius: 16px; overflow: hidden; }
        .an-chip { padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px solid var(--border, #e2e8f0); background: var(--surface-card, #fff); color: #64748b; transition: all .15s; }
        .an-chip:hover { border-color: #6366f1; color: #6366f1; }
        .an-chip.active { background: #6366f1; color: #fff; border-color: #6366f1; }
        .an-th { padding: 10px 16px; font-size: 12px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: .05em; background: var(--surface-raised, #f8fafc); border-bottom: 1px solid var(--border, #e2e8f0); text-align: left; white-space: nowrap; }
        .an-th.r { text-align: right; }
        .an-td { padding: 14px 16px; font-size: 14px; border-bottom: 1px solid var(--border, #f1f5f9); vertical-align: middle; }
        .an-td.r { text-align: right; font-variant-numeric: tabular-nums; }
        .an-tr:last-child .an-td { border-bottom: none; }
        .an-tr:hover .an-td { background: var(--surface-raised, #f8fafc); }
        .plt-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; color: #fff; }
        .post-link { color: #6366f1; text-decoration: none; font-size: 13px; display: inline-flex; align-items: center; gap: 4px; }
        .post-link:hover { text-decoration: underline; }
        .acct-pill { padding: 5px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1.5px solid var(--border, #e2e8f0); background: var(--surface-card, #fff); color: #64748b; transition: all .15s; white-space: nowrap; }
        .acct-pill:hover { border-color: #6366f1; color: #6366f1; }
        .acct-pill.active { background: #6366f1; color: #fff; border-color: #6366f1; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Performance Overview</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#94a3b8" }}>Last 30 days · {summary.accounts?.length || 0} connected account{summary.accounts?.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 999, border: "1.5px solid #6366f1", background: syncing ? "#e0e7ff" : "#6366f1", color: "#fff", fontWeight: 600, fontSize: 14, cursor: syncing ? "default" : "pointer", transition: "all .15s" }}
        >
          {syncing ? "⏳ Syncing…" : "⟳ Sync Live Data"}
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16 }}>
        {kpis.map(kpi => {
          const val = totals[kpi.key] ?? 0;
          return (
            <div key={kpi.key} className="an-card" style={{ padding: "20px 24px" }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{kpi.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>{kpi.label}</div>
              <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--ink, #1e293b)" }}>{fmtNum(val)}</div>
            </div>
          );
        })}
      </div>

      {/* Hero Chart */}
      <div className="an-card">
        <div style={{ padding: "20px 24px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 4 }}>
                {METRIC_CHIPS.find(c => c.key === activeMetric)?.label} · last 30 days
              </div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>
                {timeseries.length > 0 ? fmtNum(timeseries[timeseries.length - 1]?.value ?? 0) : "—"}
              </div>
            </div>
            {/* Account selector pills */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {summary.accounts?.map((a: any) => (
                <button key={a.id} className={`acct-pill ${selectedAccount === a.id ? "active" : ""}`}
                  onClick={() => setSelectedAccount(a.id)}>
                  {a.display_name || a.username || a.platform}
                </button>
              ))}
            </div>
          </div>
          {/* Metric filter chips */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {METRIC_CHIPS.map(chip => (
              <button key={chip.key} className={`an-chip ${activeMetric === chip.key ? "active" : ""}`}
                onClick={() => setActiveMetric(chip.key)}>
                {chip.label}
              </button>
            ))}
          </div>
        </div>
        {/* Area chart */}
        <div style={{ width: "100%", height: 260, paddingBottom: 8 }}>
          {timeseries.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeseries} margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={activeColor} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={activeColor} stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #f1f5f9)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtNum} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={42} />
                <Tooltip
                  formatter={(v: any) => [fmtNum(v), METRIC_CHIPS.find(c => c.key === activeMetric)?.label]}
                  contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 13 }}
                />
                <Area type="monotone" dataKey="value" stroke={activeColor} strokeWidth={2.5}
                  fill="url(#areaGrad)" dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: activeColor }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13 }}>
              No timeseries data yet — click Sync Live Data to pull metrics.
            </div>
          )}
        </div>
      </div>

      {/* Per-account breakdown */}
      {summary.accounts?.length > 0 && (
        <div className="an-card">
          <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border, #e2e8f0)", fontWeight: 700, fontSize: 16 }}>
            Account Breakdown
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th className="an-th">Account</th>
                  <th className="an-th">Platform</th>
                  <th className="an-th r">Followers</th>
                  <th className="an-th r">Impressions</th>
                  <th className="an-th r">Reach</th>
                  <th className="an-th r">Engagements</th>
                </tr>
              </thead>
              <tbody>
                {summary.accounts.map((acct: any) => {
                  const m = acct.metrics || {};
                  const color = PLATFORM_COLORS[acct.platform] || "#64748b";
                  return (
                    <tr key={acct.id} className="an-tr">
                      <td className="an-td">
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {acct.avatar_url && <img src={acct.avatar_url} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover" }} />}
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{acct.display_name || acct.username}</div>
                            <div style={{ fontSize: 11, color: "#94a3b8" }}>@{acct.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="an-td">
                        <span className="plt-badge" style={{ background: color }}>
                          {acct.platform}
                        </span>
                      </td>
                      <td className="an-td r">{fmtNum(m.followers?.value ?? acct.follower_count ?? 0)}</td>
                      <td className="an-td r">{fmtNum(m.impressions?.value ?? 0)}</td>
                      <td className="an-td r">{fmtNum(m.reach?.value ?? 0)}</td>
                      <td className="an-td r">{fmtNum(m.engagements?.value ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Posts Table */}
      <div className="an-card">
        <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border, #e2e8f0)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Top Performing Posts</div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>Top {posts.length} by engagement</div>
        </div>
        <div style={{ overflowX: "auto" }}>
          {posts.length === 0 ? (
            <div style={{ padding: "40px 24px", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
              No published posts yet. Publish content to see analytics here.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th className="an-th">Post</th>
                  <th className="an-th">Platform</th>
                  <th className="an-th">Published</th>
                  <th className="an-th r">❤️ Likes</th>
                  <th className="an-th r">💬 Comments</th>
                  <th className="an-th r">🔁 Shares</th>
                  <th className="an-th r">📡 Reach</th>
                  <th className="an-th">Link</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p: any) => {
                  const color = PLATFORM_COLORS[p.platform] || "#64748b";
                  const delta = fmtDelta((p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0));
                  return (
                    <tr key={p.id} className="an-tr">
                      <td className="an-td" style={{ maxWidth: 300 }}>
                        <div style={{ fontSize: 13, color: "var(--ink)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                          {p.caption || p.content || "—"}
                        </div>
                        {p.account_name && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{p.account_name}</div>}
                      </td>
                      <td className="an-td">
                        <span className="plt-badge" style={{ background: color }}>{p.platform}</span>
                      </td>
                      <td className="an-td" style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>
                        {p.published_at ? new Date(p.published_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Draft"}
                      </td>
                      <td className="an-td r" style={{ fontWeight: 600 }}>{fmtNum(p.likes ?? 0)}</td>
                      <td className="an-td r">{fmtNum(p.comments ?? 0)}</td>
                      <td className="an-td r">{fmtNum(p.shares ?? 0)}</td>
                      <td className="an-td r">{fmtNum(p.reach ?? 0)}</td>
                      <td className="an-td">
                        {p.platform_post_url ? (
                          <a href={p.platform_post_url} target="_blank" rel="noopener noreferrer" className="post-link">
                            View ↗
                          </a>
                        ) : (
                          <span style={{ color: "#cbd5e1", fontSize: 12 }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}


// ── Calendar Tab ───────────────────────────────────────────────────────────

function CalendarTab() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('calendar');
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  
  // Adjust for Monday start (0 = Monday, 6 = Sunday)
  const firstDayAdjusted = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
  const blanks = Array.from({ length: firstDayAdjusted }, (_, i) => i);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.ssCalendar(year, month + 1);
        setPosts(res.posts);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [year, month]);

  const getPostsForDay = (day: number) => {
    return posts.filter(p => {
      const d = new Date(p.scheduled_at || p.published_at);
      return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year;
    });
  };

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const today = new Date();
  const isToday = (day: number) => {
    return day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  };

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{background:'#F7F7F7'}}>
      <style>{`
        .cal-header{padding:24px 32px 20px;background:#F7F7F7;border:none}
        .cal-title{font-size:22px;font-weight:600;color:#1A1A1A;margin:0;letter-spacing:-.3px}
        .cal-controls{padding:16px 32px;background:#F7F7F7;border:none;display:flex;align-items:center;justify-content:space-between;gap:16px}
        .cal-left{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .cal-arrow{width:32px;height:32px;border:1px solid #D9D9D9;background:#fff;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#5C5C5C;font-size:16px;transition:all .15s}
        .cal-arrow:hover{background:#FAFAFA;border-color:#BFBFBF}
        .cal-month{font-size:15px;font-weight:600;color:#1A1A1A;margin:0 4px;min-width:110px}
        .cal-btn{padding:6px 12px;height:32px;border:1px solid #D9D9D9;background:#fff;border-radius:4px;font-size:13px;font-weight:500;color:#5C5C5C;cursor:pointer;transition:all .15s;display:inline-flex;align-items:center;gap:6px}
        .cal-btn:hover{background:#FAFAFA;border-color:#BFBFBF}
        .cal-toggle{display:flex;border:1px solid #D9D9D9;border-radius:4px;overflow:hidden;background:#fff}
        .toggle-btn{padding:6px 14px;height:32px;border:none;background:#fff;font-size:13px;font-weight:500;color:#5C5C5C;cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:6px;border-right:1px solid #D9D9D9}
        .toggle-btn:last-child{border-right:none}
        .toggle-btn.active{background:#FFF4E6;color:#D97706;font-weight:600}
        .toggle-btn:hover:not(.active){background:#FAFAFA}
        .cal-body{flex:1;overflow:auto;padding:0 32px 32px}
        .cal-grid{max-width:1600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.04);border:none}
        .cal-weekdays{display:grid;grid-template-columns:repeat(7,1fr);background:#FAFAFA;border-bottom:1px solid #ECECEC}
        .cal-weekday{padding:14px 16px;text-align:left;font-size:11px;font-weight:600;color:#737373;text-transform:uppercase;letter-spacing:.5px}
        .cal-days{display:grid;grid-template-columns:repeat(7,1fr);background:#fff}
        .cal-day{min-height:120px;border-right:1px solid #F5F5F5;border-bottom:1px solid #F5F5F5;padding:10px 12px;background:#fff;transition:background .12s}
        .cal-day:nth-child(7n){border-right:none}
        .cal-day.empty{background:#FAFAFA}
        .cal-day:not(.empty):hover{background:#FAFBFC;cursor:pointer}
        .day-num{font-size:13px;font-weight:500;color:#404040;margin-bottom:6px;padding:2px 6px;display:inline-block}
        .cal-day.today .day-num{background:#F97316;color:#fff;border-radius:50%;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;font-weight:600;padding:0}
        .cal-day.empty .day-num{color:#BFBFBF}
        .day-dots{display:flex;flex-wrap:wrap;gap:3px;margin-top:4px}
        .dot{width:7px;height:7px;border-radius:50%}
        .status-draft{background:#A3A3A3}
        .status-pending{background:#F97316}
        .status-approved{background:#06B6D4}
        .status-scheduled{background:#3B82F6}
        .status-publishing{background:#8B5CF6}
        .status-published{background:#10B981}
        .status-failed{background:#EF4444}
        .cal-legend{display:flex;align-items:center;justify-content:center;gap:20px;padding:14px 32px;background:#F7F7F7;border:none;flex-wrap:wrap}
        .legend{display:flex;align-items:center;gap:7px;font-size:12px;color:#737373;font-weight:500}
        .legend-dot{width:9px;height:9px;border-radius:50%}
      `}</style>

      <div className="cal-header">
        <h1 className="cal-title">Publish</h1>
      </div>

      <div className="cal-controls">
        <div className="cal-left">
          <button onClick={goToPreviousMonth} className="cal-arrow">‹</button>
          <button onClick={goToNextMonth} className="cal-arrow">›</button>
          <div className="cal-month">{monthNames[month]} {year}</div>
          <button onClick={goToToday} className="cal-btn">Today</button>
          <button className="cal-btn">Month <span style={{fontSize:'9px',color:'#999',marginLeft:'2px'}}>▼</span></button>
          <button className="cal-btn"><span style={{fontSize:'14px'}}>📄</span>All Posts<span style={{fontSize:'9px',color:'#999'}}>▼</span></button>
          <button className="cal-btn"><span style={{fontSize:'14px'}}>📱</span>Channels<span style={{fontSize:'9px',color:'#999'}}>▼</span></button>
          <button className="cal-btn"><span style={{fontSize:'14px'}}>🏷️</span>Tags<span style={{fontSize:'9px',color:'#999'}}>▼</span></button>
          <button className="cal-btn"><span style={{fontSize:'14px'}}>🕐</span>UTC (workspace)<span style={{fontSize:'9px',color:'#999'}}>▼</span></button>
        </div>
        <div className="cal-toggle">
          <button className={`toggle-btn ${viewMode==='list'?'active':''}`} onClick={()=>setViewMode('list')}><span>☰</span>List</button>
          <button className={`toggle-btn ${viewMode==='calendar'?'active':''}`} onClick={()=>setViewMode('calendar')}><span>📅</span>Calendar</button>
        </div>
      </div>

      {loading?(
        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'#999',fontSize:'14px',gap:'10px'}}>
          <span style={{fontSize:'20px'}}>⏳</span>
          <span>Loading calendar...</span>
        </div>
      ):(
        <>
          <div className="cal-body">
            <div className="cal-grid">
              <div className="cal-weekdays">
                {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d=>(
                  <div key={d} className="cal-weekday">{d}</div>
                ))}
              </div>
              <div className="cal-days">
                {blanks.map(b=>(
                  <div key={`b-${b}`} className="cal-day empty"/>
                ))}
                {days.map(d=>{
                  const dayPosts=getPostsForDay(d);
                  const isTodayCell=isToday(d);
                  return(
                    <div key={`d-${d}`} className={`cal-day ${isTodayCell?'today':''}`}>
                      <div className="day-num">{d}</div>
                      {dayPosts.length>0&&(
                        <div className="day-dots">
                          {dayPosts.map((p,i)=>{
                            let cls='status-draft';
                            if(p.status==='published')cls='status-published';
                            else if(p.status==='scheduled')cls='status-scheduled';
                            else if(p.status==='pending_review')cls='status-pending';
                            else if(p.status==='approved')cls='status-approved';
                            else if(p.status==='publishing')cls='status-publishing';
                            else if(p.status==='failed')cls='status-failed';
                            return <span key={i} className={`dot ${cls}`} title={p.caption||'Post'}/>
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="cal-legend">
            <div className="legend"><span className="legend-dot status-draft"/>Draft</div>
            <div className="legend"><span className="legend-dot status-pending"/>Pending Review</div>
            <div className="legend"><span className="legend-dot status-approved"/>Approved</div>
            <div className="legend"><span className="legend-dot status-scheduled"/>Scheduled</div>
            <div className="legend"><span className="legend-dot status-publishing"/>Publishing</div>
            <div className="legend"><span className="legend-dot status-published"/>Published</div>
            <div className="legend"><span className="legend-dot status-failed"/>Failed</div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Auto-Pilot Tab ─────────────────────────────────────────────────────────

function IdeasTab() {
  const [ideas, setIdeas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newIdea, setNewIdea] = useState("");
  const [draggedIdea, setDraggedIdea] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("ideas");
  
  const load = async () => {
    try {
      const res = await api.ssListIdeas();
      setIdeas(res.ideas);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const handleCreateIdea = async (status: string = "unassigned") => {
    if (!newIdea.trim()) return;
    try {
      await api.ssCreateIdea({ prompt: newIdea, status });
      setNewIdea("");
      load();
    } catch (e) {
      alert("Failed to create idea");
    }
  };

  const updateStatus = async (id: number, status: string) => {
    try {
      await api.ssUpdateIdeaStatus(id, status);
      load();
    } catch (e) {
      alert("Failed to update status");
    }
  };

  const handleDrop = async (e: React.DragEvent, status: string) => {
    e.preventDefault();
    if (draggedIdea === null) return;
    await updateStatus(draggedIdea, status);
    setDraggedIdea(null);
  };

  const columns = [
    { key: "unassigned", label: "Unassigned", count: ideas.filter(i => i.status === 'unassigned').length },
    { key: "todo", label: "To Do", count: ideas.filter(i => i.status === 'todo').length },
    { key: "in_progress", label: "In Progress", count: ideas.filter(i => i.status === 'in_progress').length },
    { key: "done", label: "Done", count: ideas.filter(i => i.status === 'done').length },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff" }}>
      <style>{`
        .kanban-header {
          padding: 16px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #f0ebe8;
        }
        .kanban-title {
          font-size: 28px;
          font-weight: 600;
          color: #1a1a1a;
          margin: 0;
        }
        .new-idea-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #fff;
          border: 1.5px solid #fde2d0;
          color: #f97316;
          padding: 8px 18px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }
        .new-idea-btn:hover {
          background: #fff7ed;
          border-color: #fdba74;
        }
        .kanban-tabs {
          display: flex;
          gap: 0;
          border-bottom: 1px solid #f0ebe8;
          padding: 0 24px;
        }
        .kanban-tab {
          padding: 12px 20px;
          background: none;
          border: none;
          color: #9a9a9a;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          position: relative;
          transition: color 0.15s;
        }
        .kanban-tab:hover {
          color: #6a6a6a;
        }
        .kanban-tab.active {
          color: #1a1a1a;
          font-weight: 600;
        }
        .kanban-tab.active::after {
          content: "";
          position: absolute;
          bottom: -1px;
          left: 0;
          right: 0;
          height: 2px;
          background: #1a1a1a;
        }
        .kanban-tags {
          padding: 12px 24px;
          display: flex;
          align-items: center;
          gap: 8px;
          border-bottom: 1px solid #f0ebe8;
        }
        .tags-icon {
          width: 16px;
          height: 16px;
          color: #9a9a9a;
        }
        .tag-dropdown {
          padding: 6px 12px;
          background: #f5f0e0;
          border: 1px solid #ebe6d6;
          border-radius: 6px;
          font-size: 13px;
          color: #6a6a6a;
          cursor: pointer;
        }
        .kanban-board {
          flex: 1;
          overflow-x: auto;
          overflow-y: hidden;
          padding: 24px;
        }
        .kanban-columns {
          display: flex;
          gap: 16px;
          height: 100%;
          min-width: min-content;
        }
        .kanban-column {
          width: 280px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          background: #faf5e8;
          border-radius: 12px;
          overflow: hidden;
        }
        .column-header {
          padding: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .column-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 600;
          color: #3a3a3a;
        }
        .column-count {
          background: rgba(0,0,0,0.08);
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 700;
          color: #6a6a6a;
        }
        .column-actions {
          display: flex;
          gap: 4px;
        }
        .column-action-btn {
          width: 24px;
          height: 24px;
          background: none;
          border: none;
          color: #9a9a9a;
          cursor: pointer;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }
        .column-action-btn:hover {
          background: rgba(0,0,0,0.06);
          color: #3a3a3a;
        }
        .column-cards {
          flex: 1;
          overflow-y: auto;
          padding: 0 12px 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .column-cards::-webkit-scrollbar {
          width: 6px;
        }
        .column-cards::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.15);
          border-radius: 3px;
        }
        .idea-card {
          background: #fff;
          border: 1px solid #ebe6d6;
          border-radius: 10px;
          padding: 14px;
          cursor: grab;
          transition: all 0.15s;
        }
        .idea-card:hover {
          border-color: #d6d1c1;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        .idea-card:active {
          cursor: grabbing;
        }
        .idea-card.dragging {
          opacity: 0.4;
        }
        .idea-title {
          font-size: 14px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 6px;
        }
        .idea-subtitle {
          font-size: 12px;
          color: #9a9a9a;
          line-height: 1.4;
        }
        .add-card-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          background: none;
          border: none;
          color: #9a9a9a;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          border-radius: 8px;
          transition: all 0.15s;
          width: 100%;
          justify-content: flex-start;
        }
        .add-card-btn:hover {
          background: rgba(0,0,0,0.04);
          color: #6a6a6a;
        }
        .add-icon {
          width: 14px;
          height: 14px;
        }
      `}</style>

      {/* Header */}
      <div className="kanban-header">
        <h1 className="kanban-title">Create</h1>
        <button className="new-idea-btn" onClick={() => {
          const idea = prompt("New Idea:");
          if (idea) {
            setNewIdea(idea);
            handleCreateIdea("unassigned");
          }
        }}>
          <svg className="add-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          New Idea
        </button>
      </div>

      {/* Tabs */}
      <div className="kanban-tabs">
        <button className={`kanban-tab ${activeTab === 'ideas' ? 'active' : ''}`} onClick={() => setActiveTab('ideas')}>
          Ideas
        </button>
        <button className={`kanban-tab ${activeTab === 'templates' ? 'active' : ''}`} onClick={() => setActiveTab('templates')}>
          Templates
        </button>
        <button className={`kanban-tab ${activeTab === 'feeds' ? 'active' : ''}`} onClick={() => setActiveTab('feeds')}>
          Feeds
        </button>
      </div>

      {/* Tags Filter */}
      <div className="kanban-tags">
        <svg className="tags-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
        <select className="tag-dropdown">
          <option>Tags</option>
        </select>
      </div>

      {/* Kanban Board */}
      <div className="kanban-board">
        <div className="kanban-columns">
          {columns.map(col => (
            <div key={col.key} className="kanban-column">
              <div className="column-header">
                <div className="column-title">
                  {col.label}
                  <span className="column-count">{col.count}</span>
                </div>
                <div className="column-actions">
                  <button className="column-action-btn">
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  <button className="column-action-btn">
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                    </svg>
                  </button>
                </div>
              </div>

              <div 
                className="column-cards"
                onDragOver={e => e.preventDefault()}
                onDrop={e => handleDrop(e, col.key)}
              >
                {ideas.filter(i => i.status === col.key).map(idea => (
                  <div 
                    key={idea.id} 
                    className="idea-card"
                    draggable
                    onDragStart={(e) => {
                      setDraggedIdea(idea.id);
                      e.dataTransfer.effectAllowed = 'move';
                      (e.target as HTMLElement).classList.add('dragging');
                    }}
                    onDragEnd={(e) => {
                      setDraggedIdea(null);
                      (e.target as HTMLElement).classList.remove('dragging');
                    }}
                  >
                    <div className="idea-title">{idea.prompt}</div>
                    {col.key === 'done' && (
                      <div className="idea-subtitle">
                        Save your Ideas before turning them into posts. Brainstorm ideas...
                      </div>
                    )}
                    {col.key === 'unassigned' && idea.prompt.toLowerCase().includes('check') && (
                      <div className="idea-subtitle">check</div>
                    )}
                  </div>
                ))}

                <button className="add-card-btn" onClick={() => {
                  const idea = prompt("New Idea:");
                  if (idea) {
                    setNewIdea(idea);
                    handleCreateIdea(col.key);
                  }
                }}>
                  <svg className="add-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                  New Idea
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
