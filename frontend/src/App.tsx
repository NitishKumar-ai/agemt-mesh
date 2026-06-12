import { useEffect, useMemo, useState } from "react";
import { Activity, Bot, CheckCircle2, Clock3, Files, Link2, Megaphone, PlayCircle, Settings, Shield, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import { AppShell } from "./components/AppShell";
import { SessionPage } from "./pages/SessionPage";
import { SessionsPage } from "./pages/SessionsPage";
import { WorkflowsPage } from "./pages/WorkflowsPage";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { TasksPage } from "./pages/TasksPage";
import { SchedulesPage } from "./pages/SchedulesPage";
import { ActivityPage } from "./pages/ActivityPage";
import { MarketingPage } from "./pages/MarketingPage";
import { CommitGuardPage } from "./pages/CommitGuardPage";
import { AgentsPage } from "./pages/AgentsPage";
import { ConnectionsPage } from "./pages/ConnectionsPage";
import { SafetyPage } from "./pages/SafetyPage";
import { SettingsPage } from "./pages/SettingsPage";
import { connectEventStream } from "./lib/events";
import { api } from "./lib/api";
import type { GitHubStatus, KillswitchState, MeshEvent, PageKey } from "./lib/types";

export function App() {
  const [page, setPage] = useState<PageKey>("session");
  const [sessionKey, setSessionKey] = useState(0);
  const [events, setEvents] = useState<MeshEvent[]>([]);
  const [streamState, setStreamState] = useState<"connected" | "reconnecting" | "closed">("reconnecting");
  const [githubStatus, setGithubStatus] = useState<GitHubStatus>();
  const [killswitch, setKillswitch] = useState<KillswitchState>();

  function handlePageChange(next: PageKey) {
    if (next === "session") setSessionKey((k) => k + 1);
    setPage(next);
  }

  useEffect(() => {
    return connectEventStream(
      (event) => setEvents((current) => [event, ...current].slice(0, 200)),
      setStreamState
    );
  }, []);

  useEffect(() => {
    void api.githubStatus().then(setGithubStatus).catch(() => undefined);
    void api.getKillswitchState().then(setKillswitch).catch(() => undefined);
  }, []);

  const navItems = useMemo(
    () => [
      { key: "session" as const, label: "Session", icon: Sparkles },
      { key: "sessions" as const, label: "Sessions", icon: Files },
      { key: "workflows" as const, label: "Workflows", icon: PlayCircle },
      { key: "approvals" as const, label: "Approvals", icon: ShieldAlert, badge: events.some((e) => e.eventType.includes("approval")) },
      { key: "agents" as const, label: "Agents", icon: Bot },
      { key: "safety" as const, label: "Safety", icon: Shield },
      { key: "commitguard" as const, label: "CommitGuard", icon: ShieldCheck },
      { key: "marketing" as const, label: "Marketing", icon: Megaphone },
      { key: "tasks" as const, label: "Tasks", icon: CheckCircle2 },
      { key: "schedules" as const, label: "Schedules", icon: Clock3 },
      { key: "activity" as const, label: "Activity", icon: Activity },
      { key: "connections" as const, label: "Connections", icon: Link2 },
      { key: "settings" as const, label: "Settings", icon: Settings }
    ],
    [events]
  );

  return (
    <AppShell page={page} onPageChange={handlePageChange} navItems={navItems} streamState={streamState} githubStatus={githubStatus} killswitch={killswitch} onKillswitchChange={setKillswitch}>
      {page === "session"     && <SessionPage key={sessionKey} events={events} streamState={streamState} githubStatus={githubStatus} onGitHubStatusChange={setGithubStatus} />}
      {page === "sessions"   && <SessionsPage />}
      {page === "workflows"  && <WorkflowsPage />}
      {page === "approvals"  && <ApprovalsPage events={events} />}
      {page === "agents"      && <AgentsPage />}
      {page === "commitguard" && <CommitGuardPage />}
      {page === "marketing"  && <MarketingPage />}
      {page === "tasks"      && <TasksPage />}
      {page === "schedules"  && <SchedulesPage />}
      {page === "activity"   && <ActivityPage events={events} streamState={streamState} />}
      {page === "safety"      && <SafetyPage />}
      {page === "connections" && <ConnectionsPage />}
      {page === "settings"   && <SettingsPage />}
    </AppShell>
  );
}
