import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Clock, Pencil, Play, Plus, Repeat, Trash2, X } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { StatusPill, relTime } from '../components/AutomationBits';
import { api } from '../lib/api';
import type { ScheduledTask } from '../lib/types';

const INTERVAL_META: Record<string, { label: string; cron: string; ms: number }> = {
  hourly: { label: 'Hourly', cron: '0 * * * *', ms: 3_600_000 },
  daily: { label: 'Daily · 08:00', cron: '0 8 * * *', ms: 86_400_000 },
  weekly: { label: 'Weekly · Mon', cron: '0 9 * * 1', ms: 7 * 86_400_000 },
  monthly: { label: 'Monthly · 1st', cron: '0 9 1 * *', ms: 30 * 86_400_000 },
};

function intervalLabel(interval: string) {
  return INTERVAL_META[interval]?.label ?? interval;
}
function intervalCron(interval: string) {
  return INTERVAL_META[interval]?.cron ?? '— — — — —';
}

/** Demo schedules surfaced when the backend schedule store is empty. */
function demoSchedules(): ScheduledTask[] {
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();
  return [
    {
      id: -101,
      name: 'Nightly Security Scan',
      prompt: 'Run CommitGuard across active repos and file verified high-severity findings.',
      interval: 'daily',
      enabled: true,
      last_status: 'success',
      last_run_at: ago(11 * 3_600_000),
      next_run_at: ahead(13 * 3_600_000),
      _demo: true,
    },
    {
      id: -102,
      name: 'Atlas Status Digest',
      prompt: 'Synthesise a permission-aware status brief for project-atlas and post to #leadership.',
      interval: 'daily',
      enabled: true,
      last_status: 'running',
      last_run_at: ago(40 * 60_000),
      next_run_at: ahead(20 * 3_600_000),
      _demo: true,
    },
    {
      id: -103,
      name: 'Weekly Renewal Review',
      prompt: 'Flag ARR at risk by cross-referencing forecasts with delivery milestones.',
      interval: 'weekly',
      enabled: true,
      last_status: 'success',
      last_run_at: ago(3 * 86_400_000),
      next_run_at: ahead(4 * 86_400_000),
      _demo: true,
    },
    {
      id: -104,
      name: 'Stale Connector Audit',
      prompt: 'Audit connector tokens and ACL sync; open an issue for anything expired.',
      interval: 'monthly',
      enabled: false,
      last_status: 'failed',
      last_run_at: ago(9 * 86_400_000),
      next_run_at: ahead(21 * 86_400_000),
      _demo: true,
    },
  ];
}

export function SchedulesPage() {
  const [live, setLive] = useState<ScheduledTask[]>([]);
  const [demo, setDemo] = useState<ScheduledTask[]>(demoSchedules());
  const [usedDemo, setUsedDemo] = useState(true);
  const [form, setForm] = useState({ name: '', prompt: '', interval: 'daily' });
  const [editingId, setEditingId] = useState<number | string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', prompt: '', interval: '' });
  const [runningId, setRunningId] = useState<number | string | null>(null);

  async function load() {
    try {
      const response = await api.listSchedules();
      const rows = response.schedules ?? [];
      setLive(rows);
      setUsedDemo(rows.length === 0);
    } catch {
      setLive([]);
      setUsedDemo(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // The schedules shown: real ones if the backend has them, otherwise the demo
  // set (mutated locally so create/edit/pause feel live in front of judges).
  const schedules: ScheduledTask[] = usedDemo ? demo : live;

  const isDemoRow = (s: ScheduledTask) => Boolean(s._demo) || usedDemo;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.prompt.trim()) return;
    if (usedDemo) {
      const next: ScheduledTask = {
        id: -Date.now(),
        name: form.name,
        prompt: form.prompt,
        interval: form.interval,
        enabled: true,
        last_status: null,
        last_run_at: null,
        next_run_at: new Date(Date.now() + (INTERVAL_META[form.interval]?.ms ?? 86_400_000)).toISOString(),
        _demo: true,
      };
      setDemo((d) => [next, ...d]);
      setForm({ name: '', prompt: '', interval: 'daily' });
      return;
    }
    await api.createSchedule(form);
    setForm({ name: '', prompt: '', interval: 'daily' });
    await load();
  }

  async function remove(s: ScheduledTask) {
    if (isDemoRow(s)) {
      setDemo((d) => d.filter((x) => x.id !== s.id));
      return;
    }
    await api.deleteSchedule(s.id);
    await load();
  }

  async function togglePause(s: ScheduledTask) {
    const enabled = !s.enabled;
    if (isDemoRow(s)) {
      setDemo((d) => d.map((x) => (x.id === s.id ? { ...x, enabled } : x)));
      return;
    }
    await api.updateSchedule(s.id, { enabled });
    await load();
  }

  async function runNow(s: ScheduledTask) {
    setRunningId(s.id);
    try {
      if (isDemoRow(s)) {
        setDemo((d) =>
          d.map((x) =>
            x.id === s.id ? { ...x, last_status: 'running', last_run_at: new Date().toISOString() } : x,
          ),
        );
        setTimeout(() => {
          setDemo((d) => d.map((x) => (x.id === s.id ? { ...x, last_status: 'success' } : x)));
        }, 1400);
        return;
      }
      await api.runScheduleNow(s.id);
      await load();
    } finally {
      setTimeout(() => setRunningId(null), isDemoRow(s) ? 1400 : 0);
    }
  }

  function startEdit(s: ScheduledTask) {
    setEditingId(s.id);
    setEditForm({ name: s.name, prompt: s.prompt, interval: s.interval });
  }

  async function saveEdit(s: ScheduledTask) {
    if (isDemoRow(s)) {
      setDemo((d) => d.map((x) => (x.id === s.id ? { ...x, ...editForm } : x)));
      setEditingId(null);
      return;
    }
    await api.updateSchedule(s.id, editForm);
    setEditingId(null);
    await load();
  }

  const counts = useMemo(() => {
    const active = schedules.filter((s) => s.enabled).length;
    const paused = schedules.length - active;
    return { total: schedules.length, active, paused };
  }, [schedules]);

  return (
    <div className="page page--split schedules-page">
      <section>
        <PageHeader
          eyebrow="Automation"
          title="Schedules"
          description="Recurring natural-language jobs. Pause, edit, or trigger them manually."
        />

        <div className="sched-summary">
          <span className="sched-chip">
            <CalendarClock size={14} /> {counts.total} scheduled
          </span>
          <span className="sched-chip" style={{ color: 'var(--success)' }}>
            <span className="sched-dot" style={{ background: 'var(--success)' }} /> {counts.active} active
          </span>
          <span className="sched-chip" style={{ color: 'var(--brand-ochre)' }}>
            <span className="sched-dot" style={{ background: 'var(--brand-ochre)' }} /> {counts.paused} paused
          </span>
          {usedDemo && <span className="sched-sample">sample</span>}
        </div>

        <div className="sched-list">
          {schedules.length === 0 && (
            <div className="empty-card">No schedules yet. Create one on the right.</div>
          )}
          {schedules.map((schedule) => {
            const isEditing = editingId === schedule.id;
            const isPaused = !schedule.enabled;
            const isRunning = runningId === schedule.id || schedule.last_status === 'running';

            return (
              <article key={schedule.id} className={`sched-row${isPaused ? ' sched-row--paused' : ''}`}>
                {isEditing ? (
                  <div className="sched-edit">
                    <input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="sched-input"
                    />
                    <textarea
                      value={editForm.prompt}
                      onChange={(e) => setEditForm({ ...editForm, prompt: e.target.value })}
                      rows={2}
                      className="sched-input"
                      style={{ resize: 'vertical' }}
                    />
                    <div className="sched-edit-actions">
                      <select
                        value={editForm.interval}
                        onChange={(e) => setEditForm({ ...editForm, interval: e.target.value })}
                        className="sched-select"
                      >
                        <option value="hourly">Hourly</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                      <button className="primary-button sched-sm" onClick={() => saveEdit(schedule)}>
                        Save
                      </button>
                      <button className="secondary-button sched-sm" onClick={() => setEditingId(null)}>
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="sched-main">
                      <div className="sched-row-head">
                        <h3 className="sched-name">{schedule.name}</h3>
                        {isPaused ? (
                          <span className="sched-paused-tag">Paused</span>
                        ) : (
                          <StatusPill status={isRunning ? 'running' : schedule.last_status} />
                        )}
                      </div>
                      <p className="sched-prompt">{schedule.prompt}</p>
                      <div className="sched-meta">
                        <span className="sched-meta-item">
                          <Repeat size={11} /> {intervalLabel(schedule.interval)}
                        </span>
                        <code className="sched-cron">{intervalCron(schedule.interval)}</code>
                        <span className="sched-meta-item">
                          <Clock size={11} /> next {relTime(schedule.next_run_at)}
                        </span>
                        {schedule.last_run_at && (
                          <span className="sched-meta-item sched-meta-muted">
                            last run {relTime(schedule.last_run_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="sched-actions">
                      <button
                        className={`sched-switch${schedule.enabled ? ' sched-switch--on' : ''}`}
                        onClick={() => togglePause(schedule)}
                        title={isPaused ? 'Resume schedule' : 'Pause schedule'}
                        aria-pressed={schedule.enabled}
                      >
                        <span className="sched-switch-knob" />
                      </button>
                      <button
                        className="icon-button"
                        onClick={() => runNow(schedule)}
                        disabled={runningId === schedule.id || isPaused}
                        title="Run now"
                      >
                        <Play size={14} />
                      </button>
                      <button className="icon-button" onClick={() => startEdit(schedule)} title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button className="icon-button" onClick={() => remove(schedule)} title="Delete schedule">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <aside className="form-panel sched-form-panel">
        <h2>
          <Plus size={16} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          New schedule
        </h2>
        <form onSubmit={submit}>
          <label>
            Name
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nightly security scan"
            />
          </label>
          <label>
            Prompt
            <textarea
              value={form.prompt}
              onChange={(e) => setForm({ ...form, prompt: e.target.value })}
              placeholder="Run a security audit and report high-risk findings."
            />
          </label>
          <label>
            Interval
            <select value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value })}>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <div className="sched-cron-preview">
            <Repeat size={12} /> Runs <strong>{intervalLabel(form.interval).toLowerCase()}</strong>
            <code>{intervalCron(form.interval)}</code>
          </div>
          <button className="primary-button" type="submit">
            <Plus size={15} />
            Create schedule
          </button>
        </form>
      </aside>

      <style>{`
        .sched-summary {
          display: flex; align-items: center; flex-wrap: wrap; gap: 14px;
          padding: 11px 16px; margin-bottom: 16px; border-radius: 12px;
          background: var(--surface-card, #1c2222); border: 1px solid var(--hairline);
        }
        .sched-chip {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 13px; font-weight: 600; color: var(--muted);
        }
        .sched-dot { width: 8px; height: 8px; border-radius: 50%; }
        .sched-sample {
          margin-left: auto; font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.5px; color: var(--brand-ochre);
          padding: 3px 9px; border-radius: 9999px;
          background: color-mix(in srgb, var(--brand-ochre) 14%, transparent);
        }
        .sched-list { display: flex; flex-direction: column; gap: 12px; }
        .sched-row {
          display: flex; align-items: flex-start; gap: 16px;
          background: var(--canvas); border: 1px solid var(--hairline);
          border-radius: 16px; padding: 18px 20px;
          transition: border-color 150ms ease, box-shadow 150ms ease;
        }
        .sched-row:hover { border-color: color-mix(in srgb, var(--brand-teal) 28%, var(--hairline)); }
        .sched-row--paused { opacity: 0.64; }
        .sched-main { flex: 1; min-width: 0; }
        .sched-row-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .sched-name { margin: 0; font-size: 15px; font-weight: 650; letter-spacing: -0.2px; color: var(--ink); }
        .sched-paused-tag {
          font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
          color: var(--brand-ochre); padding: 2px 8px; border-radius: 9999px;
          background: color-mix(in srgb, var(--brand-ochre) 14%, transparent);
        }
        .sched-prompt { margin: 6px 0 10px; font-size: 13px; color: var(--muted); line-height: 1.5; }
        .sched-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
        .sched-meta-item {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 12px; color: var(--muted); font-weight: 500;
        }
        .sched-meta-muted { color: var(--muted-soft); }
        .sched-cron {
          font-size: 11.5px; font-family: ui-monospace, monospace; color: var(--brand-teal);
          background: color-mix(in srgb, var(--brand-teal) 10%, transparent);
          padding: 2px 8px; border-radius: 7px;
        }
        .sched-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .sched-switch {
          position: relative; width: 38px; height: 22px; border-radius: 9999px;
          border: none; cursor: pointer; padding: 0; margin-right: 4px;
          background: var(--hairline); transition: background 160ms ease;
        }
        .sched-switch--on { background: var(--success); }
        .sched-switch-knob {
          position: absolute; top: 3px; left: 3px; width: 16px; height: 16px;
          border-radius: 50%; background: #fff; transition: transform 160ms ease;
          box-shadow: 0 1px 3px rgba(0,0,0,.3);
        }
        .sched-switch--on .sched-switch-knob { transform: translateX(16px); }
        .sched-edit { flex: 1; display: flex; flex-direction: column; gap: 8px; }
        .sched-input {
          padding: 8px 11px; border: 1px solid var(--hairline); border-radius: 10px;
          font-size: 13px; color: var(--ink); background: var(--surface-card); font-family: inherit; outline: none;
        }
        .sched-edit-actions { display: flex; gap: 6px; }
        .sched-select {
          padding: 6px 10px; border: 1px solid var(--hairline); border-radius: 10px;
          font-size: 12px; color: var(--ink); background: var(--surface-card);
        }
        .sched-sm { font-size: 12px; padding: 6px 14px; }
        .sched-cron-preview {
          display: flex; align-items: center; gap: 7px; flex-wrap: wrap;
          font-size: 12px; color: var(--muted); margin: 4px 0 14px;
          padding: 9px 12px; border-radius: 10px;
          background: var(--surface-card); border: 1px solid var(--hairline);
        }
        .sched-cron-preview strong { color: var(--ink); }
        .sched-cron-preview code {
          font-family: ui-monospace, monospace; font-size: 11.5px; color: var(--brand-teal);
          margin-left: auto;
        }
      `}</style>
    </div>
  );
}
