import { useParams } from 'react-router-dom';
import { useWorkflowDef } from '../../hooks/useOrchestration';
import { ArrowLeft, FileJson } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function WorkflowDefDetail() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { data: def, isLoading, error } = useWorkflowDef(name || '');

  if (isLoading) return <div className="loading-state">Loading...</div>;
  if (error) return <div className="error-state">{(error as Error).message}</div>;
  if (!def) return <div className="error-state">Workflow definition not found</div>;

  return (
    <div className="orchestration-page">
      <div className="page-header">
        <div className="page-header__title">
          <button className="btn btn--ghost" type="button" onClick={() => navigate('/workflows/definitions')}>
            <ArrowLeft size={16} />
          </button>
          <FileJson size={20} />
          <h1>{def.name}</h1>
          <span className="badge badge--version">v{def.version}</span>
        </div>
      </div>

      <div className="detail-grid">
        <section className="detail-section">
          <h2>Details</h2>
          <dl className="detail-list">
            <dt>Description</dt>
            <dd>{def.description || '—'}</dd>
            <dt>Owner</dt>
            <dd>{def.ownerEmail || '—'}</dd>
            <dt>Version</dt>
            <dd>{def.version}</dd>
            <dt>Tasks</dt>
            <dd>{def.tasks?.length ?? 0}</dd>
            <dt>Timeout Policy</dt>
            <dd>{def.timeoutPolicy || 'ALERT_ONLY'}</dd>
            <dt>Timeout (s)</dt>
            <dd>{def.timeoutSeconds ?? 0}</dd>
            <dt>Restartable</dt>
            <dd>{def.restartable ? 'Yes' : 'No'}</dd>
          </dl>
        </section>

        <section className="detail-section">
          <h2>Tasks</h2>
          {def.tasks && def.tasks.length > 0 ? (
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Reference</th>
                    <th>Type</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {def.tasks.map((task, i) => (
                    <tr key={task.taskReferenceName}>
                      <td>{i + 1}</td>
                      <td className="cell-name">{task.name}</td>
                      <td><code>{task.taskReferenceName}</code></td>
                      <td><span className="badge badge--task-type">{task.type}</span></td>
                      <td className="cell-desc">{task.description || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">No tasks defined</div>
          )}
        </section>
      </div>

      <section className="detail-section">
        <h2>JSON Definition</h2>
        <pre className="json-block">{JSON.stringify(def, null, 2)}</pre>
      </section>
    </div>
  );
}
