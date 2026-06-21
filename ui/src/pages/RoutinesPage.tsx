import { FormEvent, Fragment, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Play,
  Plus,
  Repeat,
  Search,
  Shield,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { StatusPill, relTime } from '../components/AutomationBits';
import { api } from '../lib/api';
import type { Routine, RoutineRun, RoutineStep } from '../lib/types';

const CADENCES: Routine['cadence'][] = ['hourly', 'daily', 'weekdays', 'weekly', 'monthly'];

/** The agents a routine can orchestrate, mirroring the server AgentRegistry. */
const AGENT_LIBRARY: { id: string; name: string; icon: typeof Bot }[] = [
  { id: 'research', name: 'Research Agent', icon: Search },
  { id: 'marketing', name: 'Marketing Agent', icon: Sparkles },
  { id: 'scheduler', name: 'Scheduler Agent', icon: CalendarClock },
  { id: 'commit_guard', name: 'CommitGuard', icon: Shield },
  { id: 'selfheal', name: 'Self-Heal Agent', icon: Wrench },
];

function agentIcon(agentId: string) {
  return AGENT_LIBRARY.find((a) => a.id === agentId)?.icon ?? Bot;
}

function cadenceLabel(r: Pick<Routine, 'cadence' | 'time'>): string {
  const c = r.cadence.charAt(0).toUpperCase() + r.cadence.slice(1);
  return r.cadence === 'hourly' ? c : `${c} · ${r.time}`;
}

// ── Tiny, safe markdown renderer for the delivered report ────────────────────
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function inline(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/(^|[^_])_([^_]+)_(?!_)/g, '$1<em>$2</em>');
}
function renderMarkdown(md: string): ReactNode {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="rtn-md-ul">
          {bullets.map((b, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: inline(b) }} />
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    if (/^#\s/.test(line)) {
      flush();
      blocks.push(<h1 key={blocks.length} className="rtn-md-h1" dangerouslySetInnerHTML={{ __html: inline(line.slice(2)) }} />);
    } else if (/^##\s/.test(line)) {
      flush();
      blocks.push(<h2 key={blocks.length} className="rtn-md-h2" dangerouslySetInnerHTML={{ __html: inline(line.slice(3)) }} />);
    } else if (/^###\s/.test(line)) {
      flush();
      blocks.push(<h3 key={blocks.length} className="rtn-md-h3" dangerouslySetInnerHTML={{ __html: inline(line.slice(4)) }} />);
    } else if (/^[-*]\s/.test(line)) {
      bullets.push(line.slice(2));
    } else if (line.trim() === '') {
      flush();
    } else {
      flush();
      blocks.push(<p key={blocks.length} className="rtn-md-p" dangerouslySetInnerHTML={{ __html: inline(line) }} />);
    }
  }
  flush();
  return blocks;
}

const EMPTY_FORM = {
  name: '',
  owner: 'CEO',
  objective: '',
  cadence: 'weekdays' as Routine['cadence'],
  time: '08:00',
  agentIds: ['research', 'marketing'] as string[],
};

export function RoutinesPage() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [runs, setRuns] = useState<RoutineRun[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [activeRun, setActiveRun] = useState<RoutineRun | null>(null);
  const [liveIndex, setLiveIndex] = useState<number>(-1); // -1 idle, n running step n, 999 report
  const [runningId, setRunningId] = useState<string | null>(null);
  const liveTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    try {
      const [r, runsRes] = await Promise.all([api.listRoutines(), api.listRoutineRuns()]);
      setRoutines(r.routines);
      setRuns(runsRes.runs);
      if (!activeRun && runsRes.runs.length) setActiveRun(runsRes.runs[0]);
    } catch {
      /* server offline — page still renders empty */
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void load();
    return () => {
      if (liveTimer.current) clearInterval(liveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const active = routines.filter((r) => r.enabled).length;
    return { total: routines.length, active, deliveries: runs.length };
  }, [routines, runs]);

  function toggleAgent(id: string) {
    setForm((f) => ({
      ...f,
      agentIds: f.agentIds.includes(id) ? f.agentIds.filter((a) => a !== id) : [...f.agentIds, id],
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.objective.trim() || form.agentIds.length === 0) return;
    const pipeline: RoutineStep[] = form.agentIds.map((id) => {
      const meta = AGENT_LIBRARY.find((a) => a.id === id)!;
      return { agentId: id, agentName: meta.name, instruction: form.objective };
    });
    await api.createRoutine({
      name: form.name,
      owner: form.owner,
      objective: form.objective,
      cadence: form.cadence,
      time: form.time,
      pipeline,
    });
    setForm(EMPTY_FORM);
    setShowForm(false);
    await load();
  }

  async function toggleEnabled(r: Routine) {
    await api.updateRoutine(r.id, { enabled: !r.enabled });
    await load();
  }

  async function remove(r: Routine) {
    await api.deleteRoutine(r.id);
    if (activeRun?.routineId === r.id) setActiveRun(null);
    await load();
  }

  async function runNow(r: Routine) {
    if (runningId) return;
    setRunningId(r.id);
    // Optimistic live orchestration: show the pipeline stepping through agents.
    const placeholder: RoutineRun = {
      id: 'live',
      routineId: r.id,
      routineName: r.name,
      owner: r.owner,
      trigger: 'manual',
      status: 'running',
      startedAt: Date.now(),
      finishedAt: null,
      report: '',
      steps: r.pipeline.map((s) => ({
        agentId: s.agentId,
        agentName: s.agentName,
        instruction: s.instruction,
        output: '',
        status: 'pending',
        startedAt: null,
        finishedAt: null,
      })),
    };
    setActiveRun(placeholder);
    setLiveIndex(0);
    if (liveTimer.current) clearInterval(liveTimer.current);
    liveTimer.current = setInterval(() => {
      setLiveIndex((i) => (i >= placeholder.steps.length - 1 ? i : i + 1));
    }, 850);

    try {
      const run = await api.runRoutineNow(r.id);
      // Let the animation breathe a moment before snapping to the real result.
      window.setTimeout(() => {
        if (liveTimer.current) clearInterval(liveTimer.current);
        setLiveIndex(999);
        setActiveRun(run);
        setRunningId(null);
        void load();
      }, 700);
    } catch {
      if (liveTimer.current) clearInterval(liveTimer.current);
      setLiveIndex(-1);
      setRunningId(null);
    }
  }

  const isLive = activeRun?.id === 'live';

  return (
    <div className="page rtn-page">
      <PageHeader
        eyebrow="Automation"
        title="Routines"
        description="Standing orders that wake up on a schedule, orchestrate a team of agents, and deliver a finished report — like a CEO's morning marketing briefing, prepared while you sleep."
        actions={
          <button className="primary-button" onClick={() => setShowForm((s) => !s)}>
            <Plus size={15} /> New routine
          </button>
        }
      />

      <div className="rtn-summary">
        <span className="rtn-chip"><CalendarClock size={14} /> {counts.total} routines</span>
        <span className="rtn-chip" style={{ color: 'var(--success)' }}>
          <span className="rtn-dot" style={{ background: 'var(--success)' }} /> {counts.active} active
        </span>
        <span className="rtn-chip"><FileText size={14} /> {counts.deliveries} deliveries</span>
      </div>

      {showForm && (
        <form className="rtn-form" onSubmit={submit}>
          <div className="rtn-form-grid">
            <label>
              Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Marketing Performance Report" />
            </label>
            <label>
              Owner
              <input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="CEO" />
            </label>
            <label>
              Cadence
              <select value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value as Routine['cadence'] })}>
                {CADENCES.map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </label>
            <label>
              Time
              <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </label>
          </div>
          <label>
            Objective
            <textarea
              value={form.objective}
              onChange={(e) => setForm({ ...form, objective: e.target.value })}
              rows={2}
              placeholder="A weekday-morning briefing on how marketing is performing and the one thing to act on today."
            />
          </label>
          <div className="rtn-agent-picker">
            <span className="rtn-field-label">Agents to orchestrate ({form.agentIds.length})</span>
            <div className="rtn-agent-options">
              {AGENT_LIBRARY.map((a) => {
                const Icon = a.icon;
                const on = form.agentIds.includes(a.id);
                return (
                  <button type="button" key={a.id} className={`rtn-agent-opt${on ? ' rtn-agent-opt--on' : ''}`} onClick={() => toggleAgent(a.id)}>
                    <Icon size={14} /> {a.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="rtn-form-actions">
            <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className="primary-button"><Plus size={15} /> Create routine</button>
          </div>
        </form>
      )}

      <div className="rtn-split">
        {/* Routines list */}
        <section className="rtn-list">
          {loaded && routines.length === 0 && (
            <div className="empty-card">No routines yet. Create one to schedule an agent team.</div>
          )}
          {routines.map((r) => {
            const Pipe = r.pipeline;
            return (
              <article key={r.id} className={`rtn-card${r.enabled ? '' : ' rtn-card--off'}`}>
                <div className="rtn-card-head">
                  <div>
                    <div className="rtn-card-title">
                      <h3>{r.name}</h3>
                      <span className="rtn-owner">for {r.owner}</span>
                    </div>
                    <p className="rtn-objective">{r.objective}</p>
                  </div>
                  {r.enabled ? <StatusPill status={r.lastStatus === 'running' ? 'running' : r.enabled ? 'active' : 'paused'} /> : <span className="rtn-paused">Paused</span>}
                </div>

                <div className="rtn-pipeline">
                  {Pipe.map((s, i) => {
                    const Icon = agentIcon(s.agentId);
                    return (
                      <Fragment key={i}>
                        <span className="rtn-agent-chip"><Icon size={12} /> {s.agentName}</span>
                        {i < Pipe.length - 1 && <span className="rtn-arrow">→</span>}
                      </Fragment>
                    );
                  })}
                </div>

                <div className="rtn-card-foot">
                  <div className="rtn-meta">
                    <span><Repeat size={11} /> {cadenceLabel(r)}</span>
                    <span><Clock size={11} /> next {relTime(r.nextRunAt)}</span>
                    {r.lastRunAt && <span className="rtn-muted">last {relTime(r.lastRunAt)}</span>}
                  </div>
                  <div className="rtn-actions">
                    <button
                      className={`rtn-switch${r.enabled ? ' rtn-switch--on' : ''}`}
                      onClick={() => toggleEnabled(r)}
                      title={r.enabled ? 'Pause routine' : 'Resume routine'}
                    >
                      <span className="rtn-switch-knob" />
                    </button>
                    <button className="primary-button rtn-run-btn" onClick={() => runNow(r)} disabled={!!runningId}>
                      {runningId === r.id ? <Loader2 size={14} className="rtn-spin" /> : <Play size={14} />} Run now
                    </button>
                    <button className="icon-button" onClick={() => remove(r)} title="Delete routine"><Trash2 size={14} /></button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        {/* Delivery / live orchestration viewer */}
        <aside className="rtn-delivery">
          {!activeRun && (
            <div className="rtn-delivery-empty">
              <FileText size={26} />
              <p>Run a routine to watch its agents work and read the delivered report here.</p>
            </div>
          )}
          {activeRun && (
            <>
              <div className="rtn-delivery-head">
                <div>
                  <span className="rtn-eyebrow">{isLive ? 'Orchestrating' : 'Delivery'}</span>
                  <h2>{activeRun.routineName}</h2>
                  <span className="rtn-delivery-sub">
                    for {activeRun.owner} · {isLive ? 'running…' : relTime(activeRun.startedAt)} · {activeRun.trigger}
                  </span>
                </div>
                <StatusPill status={activeRun.status} />
              </div>

              <div className="rtn-steps">
                {activeRun.steps.map((s, i) => {
                  const Icon = agentIcon(s.agentId);
                  const state = isLive
                    ? i < liveIndex ? 'done' : i === liveIndex ? 'running' : 'pending'
                    : s.status;
                  return (
                    <div key={i} className={`rtn-step rtn-step--${state}`}>
                      <span className="rtn-step-icon">
                        {state === 'done' ? <CheckCircle2 size={16} /> : state === 'running' ? <Loader2 size={16} className="rtn-spin" /> : <Icon size={16} />}
                      </span>
                      <div className="rtn-step-body">
                        <div className="rtn-step-name">{s.agentName}</div>
                        {!isLive && s.output ? (
                          <div className="rtn-step-output">{renderMarkdown(s.output)}</div>
                        ) : (
                          <div className="rtn-step-instruction">{s.instruction}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {!isLive && activeRun.report && (
                <div className="rtn-report">
                  <div className="rtn-report-tag"><FileText size={13} /> Delivered report</div>
                  <div className="rtn-report-body">{renderMarkdown(activeRun.report)}</div>
                </div>
              )}

              {/* Recent deliveries */}
              {runs.length > 0 && (
                <div className="rtn-feed">
                  <span className="rtn-field-label">Recent deliveries</span>
                  {runs.slice(0, 6).map((run) => (
                    <button
                      key={run.id}
                      className={`rtn-feed-row${activeRun?.id === run.id ? ' rtn-feed-row--active' : ''}`}
                      onClick={() => { setLiveIndex(999); setActiveRun(run); }}
                    >
                      <StatusPill status={run.status} />
                      <span className="rtn-feed-name">{run.routineName}</span>
                      <span className="rtn-feed-time">{relTime(run.startedAt)}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </aside>
      </div>

      <style>{`
        .rtn-page { display: flex; flex-direction: column; gap: 16px; }
        .rtn-summary { display: flex; align-items: center; flex-wrap: wrap; gap: 14px;
          padding: 11px 16px; border-radius: 12px; background: var(--surface-card, #1c2222); border: 1px solid var(--hairline); }
        .rtn-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--muted); }
        .rtn-dot { width: 8px; height: 8px; border-radius: 50%; }
        .rtn-field-label { font-size: 10px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; color: var(--muted); }

        .rtn-form { background: var(--surface-card); border: 1px solid var(--hairline); border-radius: 16px; padding: 18px; display: flex; flex-direction: column; gap: 14px; }
        .rtn-form-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 12px; }
        .rtn-form label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 600; color: var(--muted); }
        .rtn-form input, .rtn-form select, .rtn-form textarea {
          padding: 9px 11px; border: 1px solid var(--hairline); border-radius: 10px; font-size: 13px; color: var(--ink);
          background: var(--canvas); font-family: inherit; outline: none; }
        .rtn-form textarea { resize: vertical; }
        .rtn-agent-options { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
        .rtn-agent-opt { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 9999px;
          border: 1px solid var(--hairline); background: var(--canvas); color: var(--muted); font-size: 12.5px; font-weight: 600; cursor: pointer; transition: all 140ms ease; }
        .rtn-agent-opt--on { border-color: var(--brand-teal); color: var(--brand-teal); background: color-mix(in srgb, var(--brand-teal) 12%, transparent); }
        .rtn-form-actions { display: flex; justify-content: flex-end; gap: 10px; }

        .rtn-split { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 16px; align-items: start; }
        @media (max-width: 1040px) { .rtn-split { grid-template-columns: 1fr; } .rtn-form-grid { grid-template-columns: 1fr 1fr; } }

        .rtn-list { display: flex; flex-direction: column; gap: 12px; }
        .rtn-card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: 16px; padding: 18px 20px;
          display: flex; flex-direction: column; gap: 14px; transition: border-color 150ms ease; }
        .rtn-card:hover { border-color: color-mix(in srgb, var(--brand-teal) 28%, var(--hairline)); }
        .rtn-card--off { opacity: 0.62; }
        .rtn-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
        .rtn-card-title { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; }
        .rtn-card-title h3 { margin: 0; font-size: 15.5px; font-weight: 650; letter-spacing: -0.2px; color: var(--ink); }
        .rtn-owner { font-size: 12px; font-weight: 600; color: var(--brand-ochre); }
        .rtn-objective { margin: 6px 0 0; font-size: 13px; color: var(--muted); line-height: 1.5; }
        .rtn-paused { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--brand-ochre);
          padding: 2px 8px; border-radius: 9999px; background: color-mix(in srgb, var(--brand-ochre) 14%, transparent); }

        .rtn-pipeline { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
        .rtn-agent-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 600; color: var(--ink);
          padding: 4px 9px; border-radius: 8px; background: color-mix(in srgb, var(--brand-teal) 9%, transparent); border: 1px solid color-mix(in srgb, var(--brand-teal) 22%, transparent); }
        .rtn-arrow { color: var(--muted); font-size: 12px; }

        .rtn-card-foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
        .rtn-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
        .rtn-meta span { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--muted); font-weight: 500; }
        .rtn-muted { color: var(--muted-soft); }
        .rtn-actions { display: flex; align-items: center; gap: 8px; }
        .rtn-run-btn { font-size: 12.5px; padding: 7px 13px; }
        .rtn-switch { position: relative; width: 38px; height: 22px; border-radius: 9999px; border: none; cursor: pointer; padding: 0; background: var(--hairline); transition: background 160ms ease; }
        .rtn-switch--on { background: var(--success); }
        .rtn-switch-knob { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform 160ms ease; box-shadow: 0 1px 3px rgba(0,0,0,.3); }
        .rtn-switch--on .rtn-switch-knob { transform: translateX(16px); }

        .rtn-delivery { position: sticky; top: 12px; background: var(--surface-card); border: 1px solid var(--hairline); border-radius: 16px; padding: 18px; display: flex; flex-direction: column; gap: 16px; }
        .rtn-delivery-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; color: var(--muted); padding: 40px 16px; }
        .rtn-delivery-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
        .rtn-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; color: var(--brand-teal); }
        .rtn-delivery-head h2 { margin: 4px 0 2px; font-size: 17px; font-weight: 680; letter-spacing: -0.3px; color: var(--ink); }
        .rtn-delivery-sub { font-size: 12px; color: var(--muted); }

        .rtn-steps { display: flex; flex-direction: column; gap: 0; }
        .rtn-step { display: flex; gap: 11px; padding: 4px 0; position: relative; }
        .rtn-step::before { content: ''; position: absolute; left: 11px; top: 26px; bottom: -4px; width: 2px; background: var(--hairline); }
        .rtn-step:last-child::before { display: none; }
        .rtn-step-icon { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0;
          background: var(--canvas); border: 1px solid var(--hairline); color: var(--muted); z-index: 1; }
        .rtn-step--done .rtn-step-icon { color: var(--success); border-color: color-mix(in srgb, var(--success) 40%, transparent); }
        .rtn-step--running .rtn-step-icon { color: var(--brand-teal); border-color: var(--brand-teal); }
        .rtn-step-body { flex: 1; padding-bottom: 10px; min-width: 0; }
        .rtn-step-name { font-size: 13px; font-weight: 650; color: var(--ink); }
        .rtn-step-instruction { font-size: 12px; color: var(--muted); margin-top: 2px; }
        .rtn-step-output { font-size: 12.5px; color: var(--muted); margin-top: 4px; }
        .rtn-step-output .rtn-md-ul { margin: 4px 0; padding-left: 16px; }
        .rtn-step-output li { margin: 2px 0; line-height: 1.45; }

        .rtn-report { border: 1px solid color-mix(in srgb, var(--brand-teal) 30%, var(--hairline)); border-radius: 14px; overflow: hidden; }
        .rtn-report-tag { display: flex; align-items: center; gap: 6px; padding: 9px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
          color: var(--brand-teal); background: color-mix(in srgb, var(--brand-teal) 10%, transparent); border-bottom: 1px solid color-mix(in srgb, var(--brand-teal) 22%, transparent); }
        .rtn-report-body { padding: 14px 18px; }
        .rtn-md-h1 { font-size: 17px; font-weight: 700; margin: 0 0 2px; color: var(--ink); letter-spacing: -0.3px; }
        .rtn-md-h2 { font-size: 13px; font-weight: 700; margin: 14px 0 6px; color: var(--ink); text-transform: uppercase; letter-spacing: 0.4px; }
        .rtn-md-h3 { font-size: 13px; font-weight: 650; margin: 10px 0 4px; color: var(--ink); }
        .rtn-md-p { font-size: 13px; line-height: 1.55; color: var(--muted); margin: 6px 0; }
        .rtn-md-ul { margin: 6px 0; padding-left: 18px; }
        .rtn-md-ul li { font-size: 13px; line-height: 1.55; color: var(--muted); margin: 3px 0; }
        .rtn-report-body strong { color: var(--ink); }
        .rtn-report-body em { color: var(--muted-soft); font-style: italic; }
        code { font-family: ui-monospace, monospace; font-size: 12px; }

        .rtn-feed { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--hairline); padding-top: 14px; }
        .rtn-feed-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; border: 1px solid transparent;
          background: var(--canvas); cursor: pointer; text-align: left; }
        .rtn-feed-row:hover { border-color: var(--hairline); }
        .rtn-feed-row--active { border-color: color-mix(in srgb, var(--brand-teal) 35%, transparent); }
        .rtn-feed-name { flex: 1; font-size: 12.5px; font-weight: 600; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .rtn-feed-time { font-size: 11.5px; color: var(--muted); }

        .rtn-spin { animation: rtn-spin 1s linear infinite; }
        @keyframes rtn-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
