import { useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, Clock3, Files, Megaphone, PlayCircle, Settings, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
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
import { SettingsPage } from "./pages/SettingsPage";
import { connectEventStream } from "./lib/events";
import { api } from "./lib/api";
import type { GitHubStatus, MeshEvent, PageKey } from "./lib/types";

export function App() {
  const [page, setPage] = useState<PageKey>("session");
  const [events, setEvents] = useState<MeshEvent[]>([]);
  const [streamState, setStreamState] = useState<"connected" | "reconnecting" | "closed">("reconnecting");
  const [githubStatus, setGithubStatus] = useState<GitHubStatus>();

  useEffect(() => {
    return connectEventStream(
      (event) => setEvents((current) => [event, ...current].slice(0, 200)),
      setStreamState
    );
  }, []);

  useEffect(() => {
    void api.githubStatus().then(setGithubStatus).catch(() => undefined);
  }, []);

  const navItems = useMemo(
    () => [
      { key: "session" as const, label: "Session", icon: Sparkles },
      { key: "sessions" as const, label: "Sessions", icon: Files },
      { key: "workflows" as const, label: "Workflows", icon: PlayCircle },
      { key: "approvals" as const, label: "Approvals", icon: ShieldAlert, badge: events.some((e) => e.eventType.includes("approval")) },
      { key: "commitguard" as const, label: "CommitGuard", icon: ShieldCheck },
      { key: "marketing" as const, label: "Marketing", icon: Megaphone },
      { key: "tasks" as const, label: "Tasks", icon: CheckCircle2 },
      { key: "schedules" as const, label: "Schedules", icon: Clock3 },
      { key: "activity" as const, label: "Activity", icon: Activity },
      { key: "settings" as const, label: "Settings", icon: Settings }
    ],
    [events]
  );

  return (
    <AppShell page={page} onPageChange={setPage} navItems={navItems} streamState={streamState} githubStatus={githubStatus}>
      {page === "session"     && <SessionPage events={events} streamState={streamState} githubStatus={githubStatus} onGitHubStatusChange={setGithubStatus} />}
      {page === "sessions"   && <SessionsPage />}
      {page === "workflows"  && <WorkflowsPage />}
      {page === "approvals"  && <ApprovalsPage events={events} />}
      {page === "commitguard" && <CommitGuardPage />}
      {page === "marketing"  && <MarketingPage />}
      {page === "tasks"      && <TasksPage />}
      {page === "schedules"  && <SchedulesPage />}
      {page === "activity"   && <ActivityPage events={events} streamState={streamState} />}
      {page === "settings"   && <SettingsPage />}
    </AppShell>
  );
}
