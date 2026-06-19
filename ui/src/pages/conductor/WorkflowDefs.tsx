import { useWorkflowDefs } from '../../hooks/useOrchestration';
import { Workflow, Plus, Search, FileJson } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function WorkflowDefs() {
  const { data: defs, isLoading, error } = useWorkflowDefs();
  const navigate = useNavigate();

  return (
    <div className="orchestration-page">
      <div className="page-header">
        <div className="page-header__title">
          <Workflow size={20} />
          <h1>Workflow Definitions</h1>
        </div>
        <div className="page-header__actions">
          <button className="btn btn--primary" type="button" onClick={() => navigate('/workflows/definitions/new')}>
            <Plus size={16} />
            New Workflow
          </button>
        </div>
      </div>

      <div className="search-bar">
        <Search size={16} />
        <input type="text" placeholder="Search workflow definitions..." className="search-input" />
      </div>

      {isLoading && <div className="loading-state">Loading definitions...</div>}
      {error && <div className="error-state">Failed to load: {(error as Error).message}</div>}

      {defs && defs.length === 0 && (
        <div className="empty-state">
          <FileJson size={40} />
          <h3>No workflow definitions yet</h3>
          <p>Create your first workflow to get started with automation.</p>
        </div>
      )}

      {defs && defs.length > 0 && (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Version</th>
                <th>Description</th>
                <th>Tasks</th>
                <th>Owner</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {defs.map((def) => (
                <tr key={`${def.name}-${def.version}`} className="data-table__row" onClick={() => navigate(`/workflows/definitions/${def.name}`)}>
                  <td className="cell-name">{def.name}</td>
                  <td className="cell-version">{def.version}</td>
                  <td className="cell-desc">{def.description || '—'}</td>
                  <td className="cell-tasks">{def.tasks?.length ?? 0}</td>
                  <td className="cell-owner">{def.ownerEmail || '—'}</td>
                  <td className="cell-actions">
                    <button className="btn btn--sm" type="button" onClick={(e) => { e.stopPropagation(); navigate(`/workflows/definitions/${def.name}`); }}>
                      Edit
                    </button>
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
