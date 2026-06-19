import { useTaskDefs } from '../../hooks/useOrchestration';
import { CheckCircle2, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function TaskDefs() {
  const { data: defs, isLoading } = useTaskDefs();
  const navigate = useNavigate();

  return (
    <div className="orchestration-page">
      <div className="page-header">
        <div className="page-header__title">
          <CheckCircle2 size={20} />
          <h1>Task Definitions</h1>
        </div>
        <div className="page-header__actions">
          <button className="btn btn--primary" type="button" onClick={() => navigate('/tasks/definitions/new')}>
            <Plus size={16} /> New Task
          </button>
        </div>
      </div>

      {isLoading && <div className="loading-state">Loading...</div>}
      {defs && defs.length === 0 && <div className="empty-state"><CheckCircle2 size={40} /><h3>No task definitions</h3></div>}

      {defs && defs.length > 0 && (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Retry Count</th>
                <th>Timeout (s)</th>
                <th>Response Timeout</th>
                <th>Concurrent Exec</th>
                <th>Owner</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {defs.map((def) => (
                <tr key={def.name} className="data-table__row" onClick={() => navigate(`/tasks/definitions/${def.name}`)}>
                  <td className="cell-name">{def.name}</td>
                  <td>{def.retryCount ?? 3}</td>
                  <td>{def.timeoutSeconds ?? 0}</td>
                  <td>{def.responseTimeoutSeconds ?? 3600}s</td>
                  <td>{def.concurrentExecLimit ?? '∞'}</td>
                  <td>{def.ownerEmail || '—'}</td>
                  <td className="cell-actions">
                    <button className="btn btn--sm" type="button" onClick={(e) => { e.stopPropagation(); navigate(`/tasks/definitions/${def.name}`); }}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
