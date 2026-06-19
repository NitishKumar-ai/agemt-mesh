import { useEventHandlers } from '../../hooks/useOrchestration';
import { RectangleEllipsis, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function EventHandlers() {
  const { data: handlers, isLoading } = useEventHandlers();
  const navigate = useNavigate();

  return (
    <div className="orchestration-page">
      <div className="page-header">
        <div className="page-header__title">
          <RectangleEllipsis size={20} />
          <h1>Event Handlers</h1>
        </div>
        <div className="page-header__actions">
          <button className="btn btn--primary" type="button"><Plus size={16} /> New Handler</button>
        </div>
      </div>

      {isLoading && <div className="loading-state">Loading...</div>}

      {handlers && handlers.length > 0 && (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Event</th>
                <th>Actions</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {handlers.map((h) => (
                <tr key={h.name} className="data-table__row">
                  <td className="cell-name">{h.name}</td>
                  <td><code>{h.event}</code></td>
                  <td>{h.actions?.length ?? 0}</td>
                  <td><span className={`badge ${h.active ? 'badge--completed' : 'badge--terminated'}`}>{h.active ? 'Active' : 'Inactive'}</span></td>
                  <td className="cell-actions"><button className="btn btn--sm" type="button">Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {handlers && handlers.length === 0 && (
        <div className="empty-state">
          <RectangleEllipsis size={40} />
          <h3>No event handlers</h3>
        </div>
      )}
    </div>
  );
}

export function EventHandlerDetail() {
  return <div className="orchestration-page"><div className="empty-state"><RectangleEllipsis size={40} /><h3>Event handler detail — coming soon</h3></div></div>;
}
