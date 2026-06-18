import type { ComponentType, ReactNode } from 'react';
import {
  ChevronDown,
  Github,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Power,
  Settings,
  ShieldAlert,
} from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import type { GitHubStatus, KillswitchState, PageKey } from '../lib/types';
import { SessionHistory } from './SessionHistory';

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
  streamState: 'connected' | 'reconnecting' | 'closed';
  githubStatus?: GitHubStatus;
  killswitch?: KillswitchState;
  onKillswitchChange?: (state: KillswitchState) => void;
  activeSessionId: string | null;
  onSessionSelect: (runId: string) => void;
};

// Group nav items by section
const PRIMARY_KEYS: PageKey[] = ['sessions', 'workflows', 'approvals'];
const TOOLS_KEYS: PageKey[] = ['agents', 'tasks', 'schedules', 'commitguard', 'marketing'];
const SYSTEM_KEYS: PageKey[] = ['connections', 'safety', 'activity'];

export function AppShell({
  children,
  page,
  onPageChange,
  navItems,
  streamState,
  githubStatus,
  killswitch,
  onKillswitchChange,
  activeSessionId,
  onSessionSelect,
}: Props) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);

  const toggleKillswitch = async () => {
    if (!killswitch) return;

    const msg = killswitch.engaged
      ? 'Are you sure you want to DISENGAGE the global killswitch? Agents will resume work.'
      : 'Are you sure you want to ENGAGE the global killswitch? All running workflows will be halted.';

    if (!window.confirm(msg)) return;

    setLoading(true);
    try {
      const res = killswitch.engaged
        ? await api.disengageKillswitch()
        : await api.engageKillswitch('Manual emergency stop');
      onKillswitchChange?.(res.state);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to toggle killswitch');
    } finally {
      setLoading(false);
    }
  };

  const isSessionView = page === 'session' || page === 'chat';

  // Filter nav items into sections
  const primaryNav = navItems.filter((item) => PRIMARY_KEYS.includes(item.key));
  const toolsNav = navItems.filter((item) => TOOLS_KEYS.includes(item.key));
  const systemNav = navItems.filter((item) => SYSTEM_KEYS.includes(item.key));

  function renderNavButton(item: NavItem) {
    const Icon = item.icon;
    return (
      <button
        key={item.key}
        className={page === item.key ? 'sidebar-link sidebar-link--active' : 'sidebar-link'}
        type="button"
        onClick={() => onPageChange(item.key)}
      >
        <Icon size={16} />
        <span>{item.label}</span>
        {item.badge && <i />}
      </button>
    );
  }

  return (
    <div className={`app ${open ? '' : 'app--sidebar-closed'}`}>
      {killswitch?.engaged && (
        <div className="global-killswitch-banner">
          <ShieldAlert size={16} />
          <span>Global Killswitch Engaged: All agent activity is currently halted.</span>
        </div>
      )}

      <aside className="sidebar">
        <div className="sidebar-head">
          <span className="app-wordmark">Agent Mesh</span>
          <button
            className="bare-icon"
            type="button"
            onClick={() => setOpen(false)}
            title="Close sidebar"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>

        <button className="new-task-button" type="button" onClick={() => onPageChange('session')}>
          <Plus size={17} />
          New task
        </button>

        {/* Session history — shown when on session/chat page */}
        {isSessionView && (
          <SessionHistory activeSessionId={activeSessionId} onSelect={onSessionSelect} />
        )}

        {/* Navigation sections */}
        <nav className="sidebar-nav">
          {/* Primary section */}
          {primaryNav.map(renderNavButton)}

          {/* Tools divider + section */}
          {toolsNav.length > 0 && (
            <>
              <div className="nav-section-divider" />
              {toolsNav.map(renderNavButton)}
            </>
          )}

          {/* System divider + section */}
          {systemNav.length > 0 && (
            <>
              <div className="nav-section-divider" />
              {systemNav.map(renderNavButton)}
            </>
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="github-card">
            {githubStatus?.account?.avatar_url ? (
              <img src={githubStatus.account.avatar_url} alt="" />
            ) : (
              <Github size={20} />
            )}
            <div>
              <strong>
                {githubStatus?.connected
                  ? githubStatus.account?.name || githubStatus.account?.login
                  : 'Connect GitHub'}
              </strong>
              <span>
                {githubStatus?.connected
                  ? `@${githubStatus.account?.login}`
                  : 'Give agents repository context.'}
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                githubStatus?.connected ? onPageChange('session') : api.connectGitHub()
              }
            >
              {githubStatus?.connected ? `${githubStatus.imported_count} repos` : 'Connect'}
            </button>
          </div>
          <button
            className="sidebar-settings"
            type="button"
            onClick={() => onPageChange('settings')}
          >
            <Settings size={16} />
            Settings
            <span className={`live-state live-state--${streamState}`} />
          </button>
        </div>
      </aside>

      <section className="app-main">
        <header className="app-header">
          {!open && (
            <button
              className="bare-icon"
              type="button"
              onClick={() => setOpen(true)}
              title="Open sidebar"
            >
              <PanelLeftOpen size={18} />
            </button>
          )}
          <div className="header-spacer" />
          <button
            className={`header-killswitch ${killswitch?.engaged ? 'header-killswitch--engaged' : ''}`}
            type="button"
            onClick={toggleKillswitch}
            disabled={loading}
          >
            <Power size={14} />
            <span>{killswitch?.engaged ? 'Killswitch Active' : 'Killswitch'}</span>
          </button>
        </header>

        <main className="content">{children}</main>
      </section>
    </div>
  );
}
