import { FormEvent, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";
import type { ScheduledTask } from "../lib/types";

export function SchedulesPage() {
  const [schedules, setSchedules] = useState<ScheduledTask[]>([]);
  const [form, setForm] = useState({ name: "", prompt: "", interval: "daily" });

  async function load() {
    const response = await api.listSchedules();
    setSchedules(response.schedules);
  }

  useEffect(() => {
    void load();
  }, []);

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

  return (
    <div className="page page--split">
      <section>
        <PageHeader
          eyebrow="Automation"
          title="Schedules"
          description="Recurring natural-language jobs that can self-heal when execution fails."
        />
        <div className="table-card">
          {schedules.length === 0 && <div className="empty-card">No schedules yet.</div>}
          {schedules.map((schedule) => (
            <article className="schedule-row" key={schedule.id}>
              <div>
                <h3>{schedule.name}</h3>
                <p>{schedule.prompt}</p>
                <small>{schedule.interval} · next {schedule.next_run_at ?? "not scheduled"}</small>
              </div>
              <button className="icon-button" onClick={() => remove(schedule.id)} title="Disable schedule">
                <Trash2 size={16} />
              </button>
            </article>
          ))}
        </div>
      </section>
      <aside className="form-panel">
        <h2>New schedule</h2>
        <form onSubmit={submit}>
          <label>
            Name
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nightly security scan" />
          </label>
          <label>
            Prompt
            <textarea value={form.prompt} onChange={(event) => setForm({ ...form, prompt: event.target.value })} placeholder="Run a security audit and report high-risk findings." />
          </label>
          <label>
            Interval
            <select value={form.interval} onChange={(event) => setForm({ ...form, interval: event.target.value })}>
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
