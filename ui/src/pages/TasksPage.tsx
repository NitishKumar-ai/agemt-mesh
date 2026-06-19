import { useEffect, useState } from 'react';
import { Play, RefreshCw, Search } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { api } from '../lib/api';
import type { SuggestedTask } from '../lib/types';

export function TasksPage() {
  const [tasks, setTasks] = useState<SuggestedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  async function load() {
    setLoading(true);
    try {
      const response = await api.listTasks();
      setTasks(response.tasks);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = tasks.filter((task) =>
    `${task.file_path} ${task.comment} ${task.marker}`.toLowerCase().includes(query.toLowerCase()),
  );

  async function scan() {
    await api.scanTasks();
    await load();
  }

  async function run(taskId: number) {
    await api.runTask(taskId);
    await load();
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Codebase"
        title="Suggested tasks"
        description="TODO, FIXME, HACK, and XXX markers scored for autonomous execution."
        actions={
          <button className="primary-button" onClick={scan}>
            <RefreshCw size={15} />
            Scan codebase
          </button>
        }
      />
      <div className="toolbar">
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter tasks..."
        />
      </div>
      <div className="task-list">
        {loading && <div className="empty-card">Loading tasks...</div>}
        {!loading && filtered.length === 0 && (
          <div className="empty-card">No tasks found. Run a scan to populate this queue.</div>
        )}
        {filtered.map((task) => (
          <article className="task-row" key={task.id}>
            <div>
              <div className="task-row-meta">
                <span>{task.marker}</span>
                <code>
                  {task.file_path}:{task.line_number}
                </code>
              </div>
              <h3>{task.comment || 'No task description'}</h3>
              <p>{task.rationale || 'No rationale generated yet.'}</p>
            </div>
            <div className="task-row-side">
              <strong>{task.confidence ?? 0}%</strong>
              <small>{task.status ?? 'new'}</small>
              <button className="secondary-button" onClick={() => run(task.id)}>
                <Play size={14} />
                Run
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
