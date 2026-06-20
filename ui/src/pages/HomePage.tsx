import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpenCheck,
  CalendarRange,
  CircleAlert,
  FileClock,
  MessagesSquare,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { ConnectionInfo, WorkflowRun } from '../lib/types';

const workflows = [
  {
    title: 'Weekly digest',
    description: 'Decisions, completed work, blockers, risks, and changes.',
    icon: CalendarRange,
    prompt: 'What changed across the company this week?',
  },
  {
    title: 'Meeting prep',
    description: 'Prior decisions, open actions, people, and relevant context.',
    icon: MessagesSquare,
    prompt: 'Prepare me for my next meeting.',
  },
  {
    title: 'Onboarding brief',
    description: 'People, projects, vocabulary, documents, and current priorities.',
    icon: Users,
    prompt: 'Create an onboarding brief for a new team member.',
  },
  {
    title: 'Incident brief',
    description: 'Timeline, impact, owners, evidence, and unresolved follow-ups.',
    icon: CircleAlert,
    prompt: 'Summarize the latest incident and its open follow-ups.',
  },
  {
    title: 'Account summary',
    description: 'Customer state, risks, meetings, requests, and ownership.',
    icon: BookOpenCheck,
    prompt: 'Summarize the current state of a customer account.',
  },
];

export function HomePage() {
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([api.listConnections(), api.listWorkflows()]).then(([sourceResult, runResult]) => {
      if (cancelled) return;
      if (sourceResult.status === 'fulfilled') setConnections(sourceResult.value.connections);
      if (runResult.status === 'fulfilled') setRuns(runResult.value.workflows.slice(0, 4));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function ask(prompt: string) {
    const value = prompt.trim();
    navigate(value ? `/ask?q=${encodeURIComponent(value)}` : '/ask');
  }

  const healthySources = connections.filter((connection) => connection.status === 'connected').length;

  return (
    <div className="product-home">
      <section className="product-hero" aria-labelledby="home-title">
        <div className="product-hero__signal">
          <span><Radio size={13} /> Company knowledge</span>
          <span>{healthySources} source{healthySources === 1 ? '' : 's'} ready</span>
        </div>
        <h1 id="home-title">Know what your company knows.</h1>
        <p>
          Ask across connected work, verify every material claim, and turn current context into
          durable workflows.
        </p>
        <form
          className="knowledge-composer"
          onSubmit={(event) => {
            event.preventDefault();
            ask(question);
          }}
        >
          <Sparkles size={20} aria-hidden="true" />
          <label className="sr-only" htmlFor="home-question">Ask AgentMesh</label>
          <textarea
            id="home-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="What changed in Project Atlas this week?"
            rows={3}
          />
          <div className="knowledge-composer__footer">
            <span><ShieldCheck size={14} /> Permission-aware and cited</span>
            <button type="submit" aria-label="Ask question">
              Ask AgentMesh <ArrowRight size={16} />
            </button>
          </div>
        </form>
      </section>

      <section className="home-band" aria-labelledby="workflow-heading">
        <div className="section-heading">
          <div>
            <span>First-party workflows</span>
            <h2 id="workflow-heading">Start from a decision, not a blank page.</h2>
          </div>
          <button className="text-action" type="button" onClick={() => navigate('/briefs')}>
            View all briefs <ArrowRight size={15} />
          </button>
        </div>
        <div className="workflow-strip">
          {workflows.map(({ title, description, icon: Icon, prompt }) => (
            <button type="button" key={title} onClick={() => ask(prompt)}>
              <Icon size={20} />
              <strong>{title}</strong>
              <span>{description}</span>
              <ArrowRight size={15} className="workflow-strip__arrow" />
            </button>
          ))}
        </div>
      </section>

      <section className="home-grid">
        <article className="coverage-panel">
          <div className="section-heading section-heading--compact">
            <div>
              <span>Knowledge coverage</span>
              <h2>Evidence health</h2>
            </div>
            <button className="text-action" type="button" onClick={() => navigate('/admin/sources')}>
              Manage sources
            </button>
          </div>
          {loading ? (
            <div className="state-row">Checking connected knowledge…</div>
          ) : connections.length === 0 ? (
            <button className="coverage-empty" type="button" onClick={() => navigate('/admin/sources')}>
              <Search size={20} />
              <span>
                <strong>Connect a source to ground answers</strong>
                <small>AgentMesh will not guess when supporting evidence is unavailable.</small>
              </span>
              <ArrowRight size={16} />
            </button>
          ) : (
            <div className="source-list">
              {connections.slice(0, 5).map((connection) => (
                <div key={connection.id}>
                  <span className={`source-state source-state--${connection.status}`} />
                  <strong>{connection.metadata?.name || connection.provider_id}</strong>
                  <small>{connection.status === 'connected' ? 'Ready for retrieval' : connection.status}</small>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="recent-panel">
          <div className="section-heading section-heading--compact">
            <div>
              <span>Durable work</span>
              <h2>Recent runs</h2>
            </div>
            <FileClock size={19} />
          </div>
          {loading ? (
            <div className="state-row">Loading recent runs…</div>
          ) : runs.length === 0 ? (
            <div className="state-row">No workflow runs yet.</div>
          ) : (
            <div className="run-list">
              {runs.map((run) => (
                <button
                  type="button"
                  key={run.run_id}
                  onClick={() => navigate(`/briefs?workflow=${encodeURIComponent(run.run_id)}`)}
                >
                  <span className={`run-status run-status--${String(run.status).toLowerCase()}`} />
                  <span>
                    <strong>{run.agent_id || 'AgentMesh workflow'}</strong>
                    <small>{run.run_id}</small>
                  </span>
                  <em>{run.status}</em>
                </button>
              ))}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
