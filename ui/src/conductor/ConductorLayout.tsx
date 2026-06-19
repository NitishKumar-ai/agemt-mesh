import type { ComponentType, ReactNode } from 'react';
import { useMemo, useEffect, useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import {
  Activity, Bot, CheckCircle2, Clock3, Command, Files, Github,
  Link2, Megaphone, Menu, PanelLeftClose, PlayCircle, Plus, Power,
  Settings, Shield, ShieldAlert, ShieldCheck, Sparkles, Workflow,
  RectangleEllipsis, Timer, ListTree, GanttChartSquare,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { connectEventStream } from '../lib/events';
import { api } from '../lib/api';
import type { GitHubStatus, KillswitchState, MeshEvent, PageKey } from '../lib/types';

/**
 * Layout wrapper for Conductor/Orchestration pages.
 * Shares the same AppShell and sidebar as the legacy Agent Mesh pages
 * but is routed via react-router instead of state-based routing.
 */

type NavItem = {
  key: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  badge?: boolean;
};

function useSharedState() {
  const [events, setEvents] = useState<MeshEvent[]>([]);
  const [streamState, setStreamState] = useState<'connected' | 'reconnecting' | 'closed'>('reconnecting');
  const [githubStatus, setGithubStatus] = useState<GitHubStatus>();
  const [killswitch, setKillswitch] = useState<KillswitchState>();

  useEffect(() => {
    return connectEventStream(
      (event) => setEvents((current) => [event, ...current].slice(0, 200)),
      setStreamState,
    );
  }, []);

  useEffect(() => {
    void api.githubStatus().then(setGithubStatus).catch(() => undefined);
    void api.getKillswitchState().then(setKillswitch).catch(() => undefined);
  }, []);

  return { events, streamState, githubStatus, killswitch, setKillswitch };
}

export function ConductorLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { events, streamState, githubStatus, killswitch, setKillswitch } = useSharedState();

  const activePage = location.pathname.replace(/^\//, '').split('/')[0] || 'workflows';

  function handlePageChange(page: PageKey) {
    navigate('/');
    // The legacy App will pick up the page change
    window.location.href = '/';
  }

  function handleSessionSelect(runId: string) {
    navigate(`/?session=${runId}`);
    window.location.href = `/?session=${runId}`;
  }

  const orchestrationNav: NavItem[] = useMemo(() => [
    { key: 'workflows', label: 'Workflows', icon: Workflow },
    { key: 'workflows/executions', label: 'Executions', icon: GanttChartSquare },
    { key: 'tasks', label: 'Task Defs', icon: CheckCircle2 },
    { key: 'tasks/queue', label: 'Task Queue', icon: ListTree },
    { key: 'events', label: 'Events', icon: RectangleEllipsis },
    { key: 'schedulers', label: 'Schedulers', icon: Timer },
  ], []);

  const legacyNav: NavItem[] = useMemo(() => [
    { key: 'session', label: 'Session', icon: Sparkles },
    { key: 'sessions', label: 'Sessions', icon: Files },
    { key: 'workflows', label: 'Workflows', icon: PlayCircle },
    { key: 'approvals', label: 'Approvals', icon: ShieldAlert },
    { key: 'agents', label: 'Agents', icon: Bot },
    { key: 'safety', label: 'Safety', icon: Shield },
    { key: 'commitguard', label: 'CommitGuard', icon: ShieldCheck },
    { key: 'marketing', label: 'Marketing', icon: Megaphone },
    { key: 'tasks', label: 'Tasks', icon: CheckCircle2 },
    { key: 'schedules', label: 'Schedules', icon: Clock3 },
    { key: 'activity', label: 'Activity', icon: Activity },
    { key: 'connections', label: 'Connections', icon: Link2 },
    { key: 'settings', label: 'Settings', icon: Settings },
  ], []);

  const navItems = [...orchestrationNav, ...legacyNav];

  return (
    <AppShell
      page={activePage as PageKey}
      onPageChange={handlePageChange}
      navItems={navItems as any}
      streamState={streamState}
      githubStatus={githubStatus}
      killswitch={killswitch}
      onKillswitchChange={setKillswitch}
      activeSessionId={null}
      onSessionSelect={handleSessionSelect}
    >
      {/* Override the nav to handle react-router navigation for orchestration items */}
      <div className="app">
        <main className="content">
          <Outlet />
        </main>
      </div>
    </AppShell>
  );
}
