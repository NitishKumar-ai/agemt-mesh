import { useExecutions } from '../../hooks/useOrchestration';
import { GanttChartSquare, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const STATUS_COLORS: Record<string, string> = {
  RUNNING: 'badge--running',
  COMPLETED: 'badge--completed',
  FAILED: 'badge--failed',
  TIMED_OUT: 'badge--timed_out',
  TERMINATED: 'badge--terminated',
  PAUSED: 'badge--paused',
};

export function Executions() {
  const { data: searchResult, isLoading } = useExecutions();
  const navigate = useNavigate();

  return (
    <div className="orchestration-page">
      <div className="page-header">
        <div className="page-header__title">
          <GanttChartSquare size={20} />
          <h1>Workflow Executions</h1>
        </div>
      </div>

      <div className="search-bar">
        <Search size={16} />
        <input type="text" placeholder="Search executions by workflow name, ID, or correlation ID..." className="search-input" />
      </div>

      {isLoading && <div className="loading-state">Loading...</div>}

      {searchResult && searchResult.results.length > 0 && (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Workflow ID</th>
                <th>Name</th>
                <th>Version</th>
                <th>Status</th>
                <th>Created</th>
                <th>Duration</th>
                <th>Correlation ID</th>
              </tr>
            </thead>
            <tbody>
              {searchResult.results.map((exec) => {
                const duration = exec.endTime && exec.createTime
                  ? `${((exec.endTime - exec.createTime) / 1000).toFixed(1)}s`
                  : '—';
                return (
                  <tr key={exec.workflowId} className="data-table__row" onClick={() => navigate(`/workflows/executions/${exec.workflowId}`)}>
                    <td className="cell-mono">{exec.workflowId?.slice(0, 12)}…</td>
                    <td className="cell-name">{exec.workflowName}</td>
                    <td>{exec.workflowVersion}</td>
                    <td><span className={`badge ${STATUS_COLORS[exec.status] || ''}`}>{exec.status}</span></td>
                    <td>{exec.createTime ? new Date(exec.createTime).toLocaleString() : '—'}</td>
                    <td>{duration}</td>
                    <td>{exec.correlationId || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {searchResult && searchResult.results.length === 0 && (
        <div className="empty-state">
          <GanttChartSquare size={40} />
          <h3>No workflow executions</h3>
          <p>Run a workflow to see its execution history here.</p>
        </div>
      )}
    </div>
  );
}
