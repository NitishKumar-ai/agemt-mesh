import { FormEvent, useEffect, useState } from "react";
import { Pause, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";
import type { ScheduledTask } from "../lib/types";

function relTime(iso: string | undefined | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) {
    const abs = Math.abs(diff);
    if (abs < 60_000) return "in <1m";
    if (abs < 3_600_000) return `in ${Math.floor(abs / 60_000)}m`;
    if (abs < 86_400_000) return `in ${Math.floor(abs / 3_600_000)}h`;
    return `in ${Math.floor(abs / 86_400_000)}d`;
  }
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function statusPill(status: string | undefined | null) {
  if (!status) return null;
  const color =
    status === "success" || status === "completed" ? "var(--success)" :
    status === "failed" || status === "error" ? "var(--error)" :
    status === "running" ? "var(--primary)" : "var(--muted)";
  return (
    <span style={{
      display: "inline-block", padding: "2px 7px", borderRadius: 6,
      fontSize: 10, fontWeight: 700, color: "white", background: color
    }}>
      {status}
    </span>
  );
}

export function SchedulesPage() {
  const [schedules, setSchedules] = useState<ScheduledTask[]>([]);
  const [form, setForm] = useState({ name: "", prompt: "", interval: "daily" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", prompt: "", interval: "" });
  const [runningId, setRunningId] = useState<number | null>(null);

  async function load() {
    const response = await api.listSchedules();
    setSchedules(response.schedules);
  }

  useEffect(() => { void load(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.prompt.trim()) return;
    await api.createSchedule(form);
    setForm({ name: "", prompt: "", interval: "daily" });
    await load();
  }

  async function remove(id: number) {
    await api.deleteSchedule(id);
    await load();
  }

  async function togglePause(schedule: ScheduledTask) {
    const enabled = !schedule.enabled;
    await api.updateSchedule(schedule.id, { enabled });
    await load();
  }

  async function runNow(id: number) {
    setRunningId(id);
    try {
      await api.runScheduleNow(id);
      await load();
    } finally {
      setRunningId(null);
    }
  }

  function startEdit(schedule: ScheduledTask) {
    setEditingId(schedule.id);
    setEditForm({ name: schedule.name, prompt: schedule.prompt, interval: schedule.interval });
  }

  async function saveEdit(id: number) {
    await api.updateSchedule(id, editForm);
    setEditingId(null);
    await load();
  }

  return (
    <div className="page page--split">
      <section>
        <PageHeader
          eyebrow="Automation"
          title="Schedules"
          description="Recurring natural-language jobs. Pause, edit, or trigger them manually."
        />
        <div className="table-card">
          {schedules.length === 0 && <div className="empty-card">No schedules yet. Create one on the right.</div>}
          {schedules.map((schedule) => {
            const isEditing = editingId === schedule.id;
            const isPaused = !schedule.enabled;

            return (
              <article
                className="schedule-row"
                key={schedule.id}
                style={{ opacity: isPaused ? 0.6 : 1 }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEditing ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }}
                      />
                      <textarea
                        value={editForm.prompt}
                        onChange={(e) => setEditForm({ ...editForm, prompt: e.target.value })}
                        rows={2}
                        style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, resize: "vertical" }}
                      />
                      <div style={{ display: "flex", gap: 6 }}>
                        <select
                          value={editForm.interval}
                          onChange={(e) => setEditForm({ ...editForm, interval: e.target.value })}
                          style={{ padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                        >
                          <option value="hourly">Hourly</option>
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                        <button className="primary-button" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => saveEdit(schedule.id)}>Save</button>
                        <button className="secondary-button" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => setEditingId(null)}><X size={12} /></button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h3 style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {schedule.name}
                        {isPaused && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--warning)", textTransform: "uppercase" }}>Paused</span>}
                        {statusPill(schedule.last_status)}
                      </h3>
                      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>{schedule.prompt}</p>
                      <small style={{ color: "var(--subtle)" }}>
                        {schedule.interval} · next {relTime(schedule.next_run_at)}
                        {schedule.last_run_at && <> · last run {relTime(schedule.last_run_at)}</>}
                      </small>
                    </>
                  )}
                </div>
                {!isEditing && (
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button
                      className="icon-button"
                      onClick={() => runNow(schedule.id)}
                      disabled={runningId === schedule.id || isPaused}
                      title="Run now"
                    >
                      <Play size={14} />
                    </button>
                    <button className="icon-button" onClick={() => togglePause(schedule)} title={isPaused ? "Resume" : "Pause"}>
                      {isPaused ? <Play size={14} /> : <Pause size={14} />}
                    </button>
                    <button className="icon-button" onClick={() => startEdit(schedule)} title="Edit">
                      <Pencil size={14} />
                    </button>
                    <button className="icon-button" onClick={() => remove(schedule.id)} title="Disable schedule">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
      <aside className="form-panel">
        <h2>New schedule</h2>
        <form onSubmit={submit}>
          <label>
            Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nightly security scan" />
          </label>
          <label>
            Prompt
            <textarea value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} placeholder="Run a security audit and report high-risk findings." />
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
          <button className="primary-button" type="submit"><Plus size={15} />Create schedule</button>
        </form>
      </aside>
    </div>
  );
}
