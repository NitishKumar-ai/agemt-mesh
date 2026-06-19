import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  CheckCircle2,
  Clock3,
  Files,
  Link2,
  Megaphone,
  PlayCircle,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { AppShell } from './components/AppShell';
import { SessionPage } from './pages/SessionPage';
import { SessionsPage } from './pages/SessionsPage';
import { WorkflowsPage } from './pages/WorkflowsPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { TasksPage } from './pages/TasksPage';
import { SchedulesPage } from './pages/SchedulesPage';
import { ActivityPage } from './pages/ActivityPage';
import { MarketingPage } from './pages/MarketingPage';
import { CommitGuardPage } from './pages/CommitGuardPage';
import { AgentsPage } from './pages/AgentsPage';
import { ConnectionsPage } from './pages/ConnectionsPage';
import { SafetyPage } from './pages/SafetyPage';
import { SettingsPage } from './pages/SettingsPage';
import { connectEventStream } from './lib/events';
import { api } from './lib/api';
import type { GitHubStatus, KillswitchState, MeshEvent, PageKey } from './lib/types';
import { WorkflowInspector } from './components/WorkflowInspector';

export function App() {
  const [page, setPage] = useState<PageKey>('session');
  const [sessionKey, setSessionKey] = useState(0);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('workflow');
  });
  const [events, setEvents] = useState<MeshEvent[]>([]);
  const [streamState, setStreamState] = useState<'connected' | 'reconnecting' | 'closed'>(
    'reconnecting',
  );
  const [githubStatus, setGithubStatus] = useState<GitHubStatus>();
  const [killswitch, setKillswitch] = useState<KillswitchState>();

  function handlePageChange(next: PageKey) {
    if (next === 'session') {
      setSessionKey((k) => k + 1);
      setActiveSessionId(null); // Clear active session for fresh start
    }
    setPage(next);
  }

  function handleSessionSelect(runId: string) {
    setActiveSessionId(runId);
    setPage('session');
  }

  const handleWorkflowSelect = (workflowId: string | null) => {
    setActiveWorkflowId(workflowId);
    const url = new URL(window.location.href);
    if (workflowId) {
      url.searchParams.set('workflow', workflowId);
    } else {
      url.searchParams.delete('workflow');
    }
    window.history.pushState({}, '', url.toString());
  };

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setActiveWorkflowId(params.get('workflow'));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    return connectEventStream(
      (event) => setEvents((current) => [event, ...current].slice(0, 200)),
      setStreamState,
    );
  }, []);

  useEffect(() => {
    void api
      .githubStatus()
      .then(setGithubStatus)
      .catch(() => undefined);
    void api
      .getKillswitchState()
      .then(setKillswitch)
      .catch(() => undefined);
  }, []);

  const navItems = useMemo(
    () => [
      { key: 'session' as const, label: 'Session', icon: Sparkles },
      { key: 'sessions' as const, label: 'Sessions', icon: Files },
      { key: 'workflows' as const, label: 'Workflows', icon: PlayCircle },
      {
        key: 'approvals' as const,
        label: 'Approvals',
        icon: ShieldAlert,
        badge: events.some((e) => e.eventType.includes('approval')),
      },
      { key: 'agents' as const, label: 'Agents', icon: Bot },
      { key: 'safety' as const, label: 'Safety', icon: Shield },
      { key: 'commitguard' as const, label: 'CommitGuard', icon: ShieldCheck },
      { key: 'marketing' as const, label: 'Marketing', icon: Megaphone },
      { key: 'tasks' as const, label: 'Tasks', icon: CheckCircle2 },
      { key: 'schedules' as const, label: 'Schedules', icon: Clock3 },
      { key: 'activity' as const, label: 'Activity', icon: Activity },
      { key: 'connections' as const, label: 'Connections', icon: Link2 },
      { key: 'settings' as const, label: 'Settings', icon: Settings },
    ],
    [events],
  );

  return (
    <>
      <AppShell
        page={page}
        onPageChange={handlePageChange}
        navItems={navItems}
        streamState={streamState}
        githubStatus={githubStatus}
        killswitch={killswitch}
        onKillswitchChange={setKillswitch}
        activeSessionId={activeSessionId}
        onSessionSelect={handleSessionSelect}
      >
        {page === 'session' && (
          <SessionPage
            key={sessionKey}
            events={events}
            streamState={streamState}
            githubStatus={githubStatus}
            onGitHubStatusChange={setGithubStatus}
            activeSessionId={activeSessionId}
            onWorkflowSelect={handleWorkflowSelect}
            activeWorkflowId={activeWorkflowId}
          />
        )}
        {page === 'sessions' && <SessionsPage />}
        {page === 'workflows' && <WorkflowsPage activeWorkflowId={activeWorkflowId} onWorkflowSelect={handleWorkflowSelect} />}
        {page === 'approvals' && <ApprovalsPage events={events} />}
        {page === 'agents' && <AgentsPage onWorkflowSelect={handleWorkflowSelect} />}
        {page === 'commitguard' && <CommitGuardPage />}
        {page === 'marketing' && <MarketingPage />}
        {page === 'tasks' && <TasksPage />}
        {page === 'schedules' && <SchedulesPage />}
        {page === 'activity' && <ActivityPage events={events} streamState={streamState} onWorkflowSelect={handleWorkflowSelect} />}
        {page === 'safety' && <SafetyPage />}
        {page === 'connections' && <ConnectionsPage />}
        {page === 'settings' && <SettingsPage />}
      </AppShell>
      {activeWorkflowId && (
        <WorkflowInspector
          workflowId={activeWorkflowId}
          onClose={() => handleWorkflowSelect(null)}
        />
      )}
    </>
  );
}
