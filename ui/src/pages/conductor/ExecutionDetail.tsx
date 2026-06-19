import { useParams } from 'react-router-dom';
import { useExecution } from '../../hooks/useOrchestration';
import { ArrowLeft, GanttChartSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function ExecutionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: exec, isLoading, error } = useExecution(id || '');

  if (isLoading) return <div className="loading-state">Loading...</div>;
  if (error) return <div className="error-state">{(error as Error).message}</div>;
  if (!exec) return <div className="error-state">Execution not found</div>;

  const duration = exec.endTime && exec.createTime
    ? `${((exec.endTime - exec.createTime) / 1000).toFixed(1)}s`
    : exec.status === 'RUNNING' ? 'In progress...' : '—';

  return (
    <div className="orchestration-page">
      <div className="page-header">
        <div className="page-header__title">
          <button className="btn btn--ghost" type="button" onClick={() => navigate('/workflows/executions')}>
            <ArrowLeft size={16} />
          </button>
          <GanttChartSquare size={20} />
          <h1>{exec.workflowName}</h1>
          <span className={`badge ${exec.status === 'RUNNING' ? 'badge--running' : exec.status === 'COMPLETED' ? 'badge--completed' : 'badge--failed'}`}>
            {exec.status}
          </span>
          <code className="cell-mono">{exec.workflowId}</code>
        </div>
      </div>

      <div className="detail-grid">
        <section className="detail-section">
          <h2>Details</h2>
          <dl className="detail-list">
            <dt>Workflow ID</dt><dd><code>{exec.workflowId}</code></dd>
            <dt>Name</dt><dd>{exec.workflowName}</dd>
            <dt>Version</dt><dd>{exec.workflowVersion}</dd>
            <dt>Status</dt><dd><span className={`badge ${exec.status === 'COMPLETED' ? 'badge--completed' : 'badge--running'}`}>{exec.status}</span></dd>
            <dt>Created</dt><dd>{exec.createTime ? new Date(exec.createTime).toLocaleString() : '—'}</dd>
            <dt>Duration</dt><dd>{duration}</dd>
            <dt>Correlation ID</dt><dd>{exec.correlationId || '—'}</dd>
            <dt>Reason</dt><dd>{exec.reasonForIncompletion || '—'}</dd>
          </dl>
        </section>
      </div>

      {exec.tasks && exec.tasks.length > 0 && (
        <section className="detail-section">
          <h2>Tasks ({exec.tasks.length})</h2>
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Task ID</th>
                  <th>Type</th>
                  <th>Reference</th>
                  <th>Status</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                </tr>
              </thead>
              <tbody>
                {exec.tasks.map((task) => (
                  <tr key={task.taskId}>
                    <td className="cell-mono">{task.taskId?.slice(0, 12)}…</td>
                    <td>{task.taskType}</td>
                    <td><code>{task.referenceTaskName}</code></td>
                    <td><span className={`badge badge--${task.status?.toLowerCase()}`}>{task.status}</span></td>
                    <td>{task.startTime ? new Date(task.startTime).toLocaleTimeString() : '—'}</td>
                    <td>{task.endTime ? new Date(task.endTime).toLocaleTimeString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="detail-section">
        <h2>JSON</h2>
        <pre className="json-block">{JSON.stringify(exec, null, 2)}</pre>
      </section>
    </div>
  );
}
