import type { ComponentType, ReactNode } from "react";
import {
  BookOpen,
  ChevronDown,
  Github,
  Menu,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Twitter
} from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import type { GitHubStatus, PageKey } from "../lib/types";

type NavItem = {
  key: PageKey;
  label: string;
  icon: ComponentType<{ size?: number }>;
  badge?: boolean;
};

type Props = {
  children: ReactNode;
  page: PageKey;
  onPageChange: (page: PageKey) => void;
  navItems: NavItem[];
  streamState: "connected" | "reconnecting" | "closed";
  githubStatus?: GitHubStatus;
};

const recentSessions = [
  { title: "Review current security posture", status: "running" },
  { title: "Fix retry logic for network calls", status: "blocked" },
  { title: "Create nightly dependency audit", status: "success" }
];

export function AppShell({ children, page, onPageChange, navItems, streamState, githubStatus }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <div className={`app ${open ? "" : "app--sidebar-closed"}`}>
      <aside className="sidebar">
        <div className="sidebar-head">
          <button className="org-switcher" type="button">
            <span className="org-mark">IM</span>
            <span>Inmodel</span>
            <ChevronDown size={14} />
          </button>
          <button className="bare-icon" type="button" onClick={() => setOpen(false)} title="Close sidebar">
            <PanelLeftClose size={18} />
          </button>
        </div>

        <button className="new-task-button" type="button" onClick={() => onPageChange("session")}>
          <Plus size={17} />
          New task
        </button>

        <label className="sidebar-search">
          <Search size={15} />
          <input placeholder="Search for repo or sessions" />
        </label>

        <div className="sidebar-section">
          <div className="sidebar-section-title">
            <span>Recent sessions</span>
            <button type="button" onClick={() => onPageChange("sessions")}>View all</button>
          </div>
          <div className="recent-sessions">
            {recentSessions.map((session, index) => (
              <button
                className={`recent-session ${page === "session" && index === 0 ? "recent-session--active" : ""}`}
                type="button"
                key={session.title}
                onClick={() => onPageChange("session")}
              >
                <i className={`session-status session-status--${session.status}`} />
                <span>{session.title}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-section sidebar-section--tools">
          <span>Workspace</span>
          {navItems.filter((item) => !["session", "sessions", "settings"].includes(item.key)).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                className={page === item.key ? "sidebar-link sidebar-link--active" : "sidebar-link"}
                type="button"
                onClick={() => onPageChange(item.key)}
              >
                <Icon size={16} />
                <span>{item.label}</span>
                {item.badge && <i />}
              </button>
            );
          })}
        </div>

        <div className="sidebar-bottom">
          <div className="github-card">
            {githubStatus?.account?.avatar_url ? (
              <img src={githubStatus.account.avatar_url} alt="" />
            ) : (
              <Github size={20} />
            )}
            <div>
              <strong>{githubStatus?.connected ? githubStatus.account?.name || githubStatus.account?.login : "Import your repos"}</strong>
              <span>{githubStatus?.connected ? `Connected as @${githubStatus.account?.login}` : "Connect GitHub to give agents repository context."}</span>
            </div>
            <button type="button" onClick={() => githubStatus?.connected ? onPageChange("session") : api.connectGitHub()}>
              {githubStatus?.connected ? `Browse ${githubStatus.imported_count} imported` : "Connect to GitHub"}
            </button>
          </div>
          <div className="sidebar-footer-links">
            <a href="#" title="Docs"><BookOpen size={15} />Docs</a>
            <a href="#" title="Discord"><MessageCircle size={15} />Discord</a>
            <a href="#" title="Twitter"><Twitter size={15} />Twitter</a>
          </div>
          <button className="sidebar-settings" type="button" onClick={() => onPageChange("settings")}>
            <Settings size={16} />Settings
            <span className={`live-state live-state--${streamState}`} />
          </button>
        </div>
      </aside>

      <section className="app-main">
        {!open && (
          <button className="open-sidebar" type="button" onClick={() => setOpen(true)} title="Open sidebar">
            <PanelLeftOpen size={18} />
          </button>
        )}
        <header className="context-bar">
          <button type="button"><Github size={15} />{githubStatus?.account?.login ?? "agent-mesh"}<ChevronDown size={14} /></button>
          <span>/</span>
          <strong>{page === "session" ? "New task" : navItems.find((item) => item.key === page)?.label}</strong>
          <div className="context-actions">
            <button type="button"><Menu size={15} />main<ChevronDown size={14} /></button>
          </div>
        </header>
        <main className="content">{children}</main>
      </section>
    </div>
  );
}
