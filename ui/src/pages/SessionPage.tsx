import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Braces,
  Cloud,
  Github,
  Import,
  Network,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from 'lucide-react';
import { api } from '../lib/api';
import type {
  AgentStep,
  GitHubRepository,
  GitHubStatus,
  MeshEvent,
  SessionMessage,
} from '../lib/types';
import { Composer } from '../components/Composer';
import { ContextPane } from '../components/ContextPane';
import { Transcript } from '../components/Transcript';

const quickStarts = [
  {
    label: 'Scan codebase',
    prompt: 'Scan this codebase for high-risk security issues',
    icon: ScanSearch,
  },
  {
    label: 'Run nightly audit',
    prompt: 'Create a nightly dependency and security audit',
    icon: ShieldCheck,
  },
  {
    label: 'Test a webhook',
    prompt: 'Test the Render self-healing webhook flow',
    icon: Network,
  },
];

export function SessionPage({
  events,
  streamState,
  githubStatus,
  onGitHubStatusChange,
  activeSessionId,
}: {
  events: MeshEvent[];
  streamState: 'connected' | 'reconnecting' | 'closed';
  githubStatus?: GitHubStatus;
  onGitHubStatusChange: (status: GitHubStatus) => void;
  activeSessionId?: string | null;
}) {
  const [workflowId, setWorkflowId] = useState<string>();
  const [running, setRunning] = useState(false);
  const [homePrompt, setHomePrompt] = useState('');
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [importedIds, setImportedIds] = useState<Set<number>>(new Set());
  const [repoError, setRepoError] = useState('');
  const [repoPickerOpen, setRepoPickerOpen] = useState(false);
  const [loadedSteps, setLoadedSteps] = useState<AgentStep[]>([]);
  const sessionEvents = useMemo(() => events.slice(0, 60), [events]);
  const taskStarted = Boolean(
    workflowId || messages.length || sessionEvents.length || activeSessionId,
  );

  // Load steps when an active session is selected from sidebar
  useEffect(() => {
    if (!activeSessionId) {
      setLoadedSteps([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getSession(activeSessionId);
        if (!cancelled) {
          setLoadedSteps(res.steps);
          // Convert steps to messages for display
          const stepMessages: SessionMessage[] = res.steps.map((step, i) => ({
            id: `step-${step.id}`,
            role: 'agent' as const,
            title: step.step,
            body: `Step ${i + 1}: ${step.step}`,
            time: new Date(step.created_at),
            status:
              step.status === 'success' || step.status === 'completed'
                ? ('success' as const)
                : step.status === 'failed' || step.status === 'error'
                  ? ('failed' as const)
                  : step.status === 'running' || step.status === 'executing'
                    ? ('executing' as const)
                    : ('idle' as const),
          }));
          setMessages(stepMessages);
        }
      } catch {
        // Session not loadable
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSessionId]);

  async function loadRepositories() {
    setRepoPickerOpen(true);
    setRepoError('');
    try {
      const [available, imported] = await Promise.all([
        api.listGitHubRepositories(),
        api.listImportedRepositories(),
      ]);
      setRepositories(available.repositories);
      setImportedIds(new Set(imported.repositories.map((repo) => repo.id)));
    } catch (error) {
      setRepoError(error instanceof Error ? error.message : 'Could not load repositories');
    }
  }

  async function importRepository(repositoryId: number) {
    await api.importGitHubRepository(repositoryId);
    setImportedIds((current) => new Set(current).add(repositoryId));
    onGitHubStatusChange(await api.githubStatus());
  }

  async function submitPrompt(prompt: string) {
    setMessages((current) => [
      ...current,
      {
        id: `user-${Date.now()}`,
        role: 'user',
        body: prompt,
        time: new Date(),
      },
    ]);
    setRunning(true);

    // Store the session title as the first user prompt
    if (messages.length === 0) {
      const title = prompt.length > 60 ? prompt.slice(0, 60) + '…' : prompt;
      // Will be stored when we get a workflow_id
      api.setSessionTitle(`pending-${Date.now()}`, title);
    }

    try {
      const response = await api.runWorkflow(prompt);
      setWorkflowId(response.workflow_id);

      // Store session title
      const title = prompt.length > 60 ? prompt.slice(0, 60) + '…' : prompt;
      api.setSessionTitle(response.workflow_id, title);

      setMessages((current) => [
        ...current,
        {
          id: `agent-${Date.now()}`,
          role: 'agent',
          title: 'Task started',
          body: 'I created a durable workflow and started planning. Live execution steps will appear below.',
          time: new Date(),
          status: 'executing',
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: `error-${Date.now()}`,
          role: 'system',
          title: 'Could not start task',
          body: 'The backend is not reachable. Make sure the API server is running.',
          time: new Date(),
          status: 'failed',
        },
      ]);
    } finally {
      setRunning(false);
    }
  }

  async function approve(approved: boolean) {
    if (!workflowId) return;
    await api.approveWorkflow(workflowId, approved);
  }

  if (!taskStarted) {
    return (
      <div className="task-home">
        <div className="home-content">
          <div className="hero-kicker">
            <Sparkles size={16} />
            Autonomous engineering workspace
          </div>
          <h1>What can I help you build?</h1>
          <p>
            Ask Agent Mesh to inspect a repository, implement a change, run an audit, or coordinate
            a durable workflow.
          </p>

          <form
            className="hero-prompt"
            onSubmit={(event) => {
              event.preventDefault();
              if (homePrompt.trim()) void submitPrompt(homePrompt.trim());
            }}
          >
            <textarea
              value={homePrompt}
              onChange={(event) => setHomePrompt(event.target.value)}
              placeholder="Describe a task or ask a question"
              rows={3}
            />
            <div className="hero-prompt-footer">
              <button
                type="button"
                className="prompt-tool"
                onClick={() =>
                  githubStatus?.connected ? void loadRepositories() : api.connectGitHub()
                }
              >
                <Github size={16} />
                Add repository
              </button>
              <span>CommitGuard</span>
              <button
                className="hero-submit"
                type="submit"
                disabled={!homePrompt.trim() || running}
              >
                <ArrowRight size={18} />
              </button>
            </div>
          </form>

          <div className="import-row">
            <div>
              <Import size={19} />
              <span>
                <strong>
                  {githubStatus?.connected
                    ? `Connected as @${githubStatus.account?.login}`
                    : 'Import your repos'}
                </strong>
                <small>
                  {githubStatus?.connected
                    ? `${githubStatus.imported_count} repositories imported`
                    : 'Give agents the context they need to work.'}
                </small>
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                githubStatus?.connected ? void loadRepositories() : api.connectGitHub()
              }
            >
              <Github size={16} />
              {githubStatus?.connected ? 'Browse repositories' : 'Connect to GitHub'}
            </button>
          </div>

          {repoPickerOpen && (
            <section className="repo-picker">
              <div className="repo-picker-head">
                <div>
                  <h2>Your repositories</h2>
                  <p>Select repositories Agent Mesh can use as task context.</p>
                </div>
                <button type="button" onClick={() => setRepoPickerOpen(false)}>
                  Close
                </button>
              </div>
              {repoError && <div className="repo-error">{repoError}</div>}
              {!repoError && repositories.length === 0 && (
                <div className="repo-empty">No repositories were returned for this account.</div>
              )}
              <div className="repo-list">
                {repositories.slice(0, 12).map((repo) => (
                  <article key={repo.id}>
                    <Github size={17} />
                    <div>
                      <strong>{repo.full_name}</strong>
                      <span>
                        {repo.description || `${repo.private ? 'Private' : 'Public'} repository`}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={importedIds.has(repo.id)}
                      onClick={() => void importRepository(repo.id)}
                    >
                      {importedIds.has(repo.id) ? 'Imported' : 'Import'}
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="home-section">
            <h2>Start with a task</h2>
            <div className="quick-starts">
              {quickStarts.map(({ label, prompt, icon: Icon }) => (
                <button type="button" key={label} onClick={() => void submitPrompt(prompt)}>
                  <Icon size={18} />
                  <span>{label}</span>
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
          </section>

          <section className="home-section">
            <h2>Integrations</h2>
            <div className="integration-row">
              <button type="button">
                <Cloud size={18} />
                <span>
                  <strong>Configure Render</strong>
                  <small>Self-healing deploys</small>
                </span>
              </button>
              <button type="button">
                <TerminalSquare size={18} />
                <span>
                  <strong>Download CLI</strong>
                  <small>Work from your terminal</small>
                </span>
              </button>
              <button type="button">
                <Braces size={18} />
                <span>
                  <strong>Try API</strong>
                  <small>Build with Agent Mesh</small>
                </span>
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="running-layout">
      <section className="running-main">
        <div className="task-titlebar">
          <div>
            <span className="task-repo">
              <Github size={14} />
              agent-mesh
            </span>
            <h1>{messages.find((message) => message.role === 'user')?.body ?? 'Agent task'}</h1>
          </div>
          <div className={`connection-dot connection-dot--${streamState}`}>{streamState}</div>
        </div>
        <div className="progress-strip">
          <span className="progress-strip--done">
            <i />
            Task created
          </span>
          <span className="progress-strip--active">
            <i />
            Planning and executing
          </span>
          <span>
            <i />
            Review
          </span>
        </div>
        <Transcript
          messages={messages}
          events={sessionEvents}
          workflowId={workflowId}
          running={running}
          onApprove={approve}
        />
        <Composer running={running} onSubmit={submitPrompt} />
      </section>
      <ContextPane events={sessionEvents} workflowId={workflowId} />
    </div>
  );
}
