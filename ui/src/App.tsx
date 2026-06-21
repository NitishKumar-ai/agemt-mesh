import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BookOpenCheck,
  Cable,
  ChartNoAxesCombined,
  History,
  Rocket,
  MessageSquarePlus,
  Network,
  PlayCircle,
  Repeat,
  Settings,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { WorkflowInspector } from './components/WorkflowInspector';
import { connectEventStream } from './lib/events';
import { api } from './lib/api';
import type { GitHubStatus, KillswitchState, MeshEvent, PageKey } from './lib/types';
import { ActivityPage } from './pages/ActivityPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { AgentsPage } from './pages/AgentsPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { AskPage } from './pages/AskPage';
import { CommitGuardPage } from './pages/CommitGuardPage';
import { ConnectionsPage } from './pages/ConnectionsPage';
import { GrowthBriefPage } from './pages/GrowthBriefPage';
import { HomePage } from './pages/HomePage';
import { KnowledgePage } from './pages/KnowledgePage';
import { MarketingPage } from './pages/MarketingPage';
import { RoutinesPage } from './pages/RoutinesPage';
import { SafetyPage } from './pages/SafetyPage';
import { SchedulesPage } from './pages/SchedulesPage';
import { SessionPage } from './pages/SessionPage';
import { SessionsPage } from './pages/SessionsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TasksPage } from './pages/TasksPage';
import { WorkflowsPage } from './pages/WorkflowsPage';

const PATHS: Partial<Record<PageKey, string>> = {
  home: '/home',
  ask: '/ask',
  briefs: '/briefs',
  growth: '/growth',
  routines: '/routines',
  knowledge: '/knowledge',
  activity: '/activity',
  sources: '/admin/sources',
  admin: '/admin',
  automation: '/admin/automation',
  audit: '/admin/audit',
  settings: '/settings',
  session: '/labs/session',
  sessions: '/labs/sessions',
  approvals: '/labs/approvals',
  agents: '/labs/agents',
  tasks: '/labs/tasks',
  schedules: '/labs/schedules',
  safety: '/labs/safety',
  commitguard: '/labs/commitguard',
  marketing: '/labs/marketing',
};

export function pageForPath(pathname: string): PageKey {
  if (pathname === '/' || pathname.startsWith('/home')) return 'home';
  if (pathname.startsWith('/ask')) return 'ask';
  if (pathname.startsWith('/briefs')) return 'briefs';
  if (pathname.startsWith('/growth')) return 'growth';
  if (pathname.startsWith('/routines')) return 'routines';
  if (pathname.startsWith('/knowledge')) return 'knowledge';
  if (pathname.startsWith('/activity')) return 'activity';
  if (pathname.startsWith('/admin/sources')) return 'sources';
  if (pathname.startsWith('/admin/automation')) return 'automation';
  if (pathname.startsWith('/admin/audit')) return 'audit';
  if (pathname === '/admin' || pathname.startsWith('/admin/overview')) return 'admin';
  if (pathname.startsWith('/settings')) return 'settings';
  const lab = pathname.split('/')[2] as PageKey | undefined;
  return lab || 'home';
}

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = pageForPath(location.pathname);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [events, setEvents] = useState<MeshEvent[]>([]);
  const [streamState, setStreamState] = useState<'connected' | 'reconnecting' | 'closed'>('reconnecting');
  const [githubStatus, setGithubStatus] = useState<GitHubStatus>();
  const [killswitch, setKillswitch] = useState<KillswitchState>();
  const activeWorkflowId = searchParams.get('workflow');

  useEffect(() => connectEventStream(
    (event) => setEvents((current) => [event, ...current].slice(0, 200)),
    setStreamState,
  ), []);

  useEffect(() => {
    void api.githubStatus().then(setGithubStatus).catch(() => undefined);
    void api.getKillswitchState().then(setKillswitch).catch(() => undefined);
  }, []);

  const navItems = useMemo(
    () => [
      { key: 'home' as const, label: 'New chat', icon: MessageSquarePlus },
      { key: 'ask' as const, label: 'History', icon: History },
      { key: 'briefs' as const, label: 'Briefs', icon: BookOpenCheck },
      { key: 'growth' as const, label: 'Growth Brief', icon: Rocket },
      { key: 'routines' as const, label: 'Routines', icon: Repeat },
      { key: 'knowledge' as const, label: 'Knowledge', icon: Network },
      { key: 'activity' as const, label: 'Activity', icon: Activity },
      { key: 'admin' as const, label: 'Overview', icon: ChartNoAxesCombined },
      { key: 'sources' as const, label: 'Sources', icon: Cable },
      { key: 'automation' as const, label: 'Automation', icon: PlayCircle },
      {
        key: 'audit' as const,
        label: 'Audit and safety',
        icon: ShieldCheck,
        badge: events.some((event) => event.eventType?.includes('approval')),
      },
      { key: 'settings' as const, label: 'Settings', icon: Settings },
    ],
    [events],
  );

  function changePage(next: PageKey) {
    navigate(PATHS[next] || '/home');
  }

  function selectWorkflow(workflowId: string | null) {
    const next = new URLSearchParams(searchParams);
    if (workflowId) next.set('workflow', workflowId);
    else next.delete('workflow');
    setSearchParams(next);
  }

  function renderPage() {
    switch (page) {
      // `/` and `/home` start a new working chat session; `/ask` is the history list.
      case 'home':
        return <HomePage />;
      case 'ask':
        return <AskPage />;
      case 'briefs':
      case 'automation':
        return <WorkflowsPage activeWorkflowId={activeWorkflowId} onWorkflowSelect={selectWorkflow} />;
      case 'growth':
        return <GrowthBriefPage />;
      case 'routines':
        return <RoutinesPage />;
      case 'knowledge':
        return <KnowledgePage />;
      case 'activity':
        return <ActivityPage events={events} streamState={streamState} onWorkflowSelect={selectWorkflow} />;
      case 'sources':
        return <ConnectionsPage />;
      case 'admin':
        return <AdminDashboard />;
      case 'audit':
        return <SafetyPage />;
      case 'settings':
        return <SettingsPage />;
      case 'session':
        return (
          <SessionPage
            events={events}
            streamState={streamState}
            githubStatus={githubStatus}
            onGitHubStatusChange={setGithubStatus}
            activeSessionId={activeSessionId}
            onWorkflowSelect={selectWorkflow}
            activeWorkflowId={activeWorkflowId}
          />
        );
      case 'sessions':
        return <SessionsPage />;
      case 'approvals':
        return <ApprovalsPage events={events} />;
      case 'agents':
        return <AgentsPage onWorkflowSelect={selectWorkflow} />;
      case 'tasks':
        return <TasksPage />;
      case 'schedules':
        return <SchedulesPage />;
      case 'commitguard':
        return <CommitGuardPage />;
      case 'marketing':
        return <MarketingPage />;
      default:
        return <HomePage />;
    }
  }

  return (
    <>
      <AppShell
        page={page}
        onPageChange={changePage}
        navItems={navItems}
        streamState={streamState}
        githubStatus={githubStatus}
        killswitch={killswitch}
        onKillswitchChange={setKillswitch}
        activeSessionId={activeSessionId}
        onSessionSelect={(runId) => {
          setActiveSessionId(runId);
          navigate('/labs/session');
        }}
      >
        {renderPage()}
      </AppShell>
      {activeWorkflowId && (
        <WorkflowInspector workflowId={activeWorkflowId} onClose={() => selectWorkflow(null)} />
      )}
    </>
  );
}
