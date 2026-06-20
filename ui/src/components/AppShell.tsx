import type { ComponentType, ReactNode } from 'react';
import {
  AlertTriangle,
  Command,
  Github,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Power,
  Settings,
  ShieldAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';
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
const WORKSPACE_KEYS: PageKey[] = ['home', 'ask', 'briefs', 'knowledge', 'activity'];
const ADMIN_KEYS: PageKey[] = ['admin', 'sources', 'automation', 'audit'];

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
  const [confirmKillswitch, setConfirmKillswitch] = useState(false);
  const [killswitchError, setKillswitchError] = useState('');

  useEffect(() => {
    const media = window.matchMedia('(max-width: 860px)');
    const syncSidebar = () => setOpen(!media.matches);
    syncSidebar();
    media.addEventListener('change', syncSidebar);
    return () => media.removeEventListener('change', syncSidebar);
  }, []);

  useEffect(() => {
    if (window.matchMedia('(max-width: 860px)').matches) {
      setOpen(false);
    }
  }, [page]);

  const toggleKillswitch = async () => {
    if (!killswitch) return;
    setKillswitchError('');
    setLoading(true);
    try {
      const res = killswitch.engaged
        ? await api.disengageKillswitch()
        : await api.engageKillswitch('Manual emergency stop');
      onKillswitchChange?.(res.state);
      setConfirmKillswitch(false);
    } catch (e) {
      setKillswitchError(e instanceof Error ? e.message : 'Failed to toggle killswitch');
    } finally {
      setLoading(false);
    }
  };

  const isSessionView = page === 'session' || page === 'chat';

  // Filter nav items into sections
  const workspaceNav = navItems.filter((item) => WORKSPACE_KEYS.includes(item.key));
  const adminNav = navItems.filter((item) => ADMIN_KEYS.includes(item.key));
  const utilityNav = navItems.filter((item) => !WORKSPACE_KEYS.includes(item.key) && !ADMIN_KEYS.includes(item.key));
  const activeItem = navItems.find((item) => item.key === page);

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

      {open && (
        <button
          className="sidebar-scrim"
          type="button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}

      <aside className="sidebar">
        <div className="sidebar-head">
          <span className="app-wordmark">
            <span className="app-mark">
              <Command size={15} />
            </span>
            Agent Mesh
          </span>
          <button
            className="bare-icon"
            type="button"
            onClick={() => setOpen(false)}
            title="Close sidebar"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>

        <button className="new-task-button" type="button" onClick={() => onPageChange('ask')}>
          <Plus size={17} />
          Ask AgentMesh
        </button>

        {/* Session history — shown when on session/chat page */}
        {isSessionView && (
          <SessionHistory activeSessionId={activeSessionId} onSelect={onSessionSelect} />
        )}

        {/* Navigation sections */}
        <nav className="sidebar-nav">
          <span className="nav-section-label">Workspace</span>
          {workspaceNav.map(renderNavButton)}

          {adminNav.length > 0 && (
            <>
              <div className="nav-section-divider" />
              <span className="nav-section-label">Administration</span>
              {adminNav.map(renderNavButton)}
            </>
          )}

          {utilityNav.length > 0 && (
            <>
              <div className="nav-section-divider" />
              {utilityNav.map(renderNavButton)}
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
              <Menu size={18} />
            </button>
          )}
          <div className="header-context">
            <span>Agent Mesh</span>
            <i>/</i>
            <strong>{activeItem?.label ?? 'Session'}</strong>
          </div>
          <div className="header-spacer" />
          <span className={`header-stream header-stream--${streamState}`}>
            <i />
            {streamState === 'connected' ? 'Live' : streamState}
          </span>
          <button
            className={`header-killswitch ${killswitch?.engaged ? 'header-killswitch--engaged' : ''}`}
            type="button"
            onClick={() => setConfirmKillswitch(true)}
            disabled={loading}
          >
            <Power size={14} />
            <span>{killswitch?.engaged ? 'Killswitch Active' : 'Killswitch'}</span>
          </button>
        </header>

        <main className="content">{children}</main>
      </section>

      {confirmKillswitch && (
        <div className="product-dialog-backdrop" role="presentation">
          <section
            className="product-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="killswitch-dialog-title"
            aria-describedby="killswitch-dialog-description"
          >
            <div className="product-dialog__icon"><AlertTriangle size={21} /></div>
            <span>Privileged operation</span>
            <h2 id="killswitch-dialog-title">
              {killswitch?.engaged ? 'Resume all agent activity?' : 'Stop all agent activity?'}
            </h2>
            <p id="killswitch-dialog-description">
              {killswitch?.engaged
                ? 'Disengaging the global killswitch allows paused agents and workflows to resume.'
                : 'Engaging the global killswitch halts running agent workflows across this deployment.'}
            </p>
            {killswitchError && <div className="product-dialog__error" role="alert">{killswitchError}</div>}
            <div className="product-dialog__actions">
              <button type="button" className="secondary-button" onClick={() => setConfirmKillswitch(false)} disabled={loading}>
                Cancel
              </button>
              <button
                type="button"
                className={killswitch?.engaged ? 'primary-button' : 'danger-button'}
                onClick={() => void toggleKillswitch()}
                disabled={loading}
              >
                {loading ? 'Updating…' : killswitch?.engaged ? 'Resume agents' : 'Engage killswitch'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
