import { useSchedules } from '../../hooks/useOrchestration';
import { Timer, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function Schedulers() {
  const { data: schedules, isLoading } = useSchedules();
  const navigate = useNavigate();

  return (
    <div className="orchestration-page">
      <div className="page-header">
        <div className="page-header__title">
          <Timer size={20} />
          <h1>Schedulers</h1>
        </div>
        <div className="page-header__actions">
          <button className="btn btn--primary" type="button"><Plus size={16} /> New Schedule</button>
        </div>
      </div>

      {isLoading && <div className="loading-state">Loading...</div>}

      {schedules && schedules.length > 0 && (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Workflow</th>
                <th>Version</th>
                <th>Cron</th>
                <th>Enabled</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.name} className="data-table__row">
                  <td className="cell-name">{s.name}</td>
                  <td>{s.workflowName}</td>
                  <td>{s.workflowVersion ?? 1}</td>
                  <td><code>{s.cronExpression}</code></td>
                  <td><span className={`badge ${s.enabled ? 'badge--completed' : 'badge--terminated'}`}>{s.enabled ? 'Enabled' : 'Disabled'}</span></td>
                  <td className="cell-actions"><button className="btn btn--sm" type="button">Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {schedules && schedules.length === 0 && (
        <div className="empty-state">
          <Timer size={40} />
          <h3>No schedulers</h3>
        </div>
      )}
    </div>
  );
}

export function SchedulerDetail() {
  return <div className="orchestration-page"><div className="empty-state"><Timer size={40} /><h3>Schedule detail — coming soon</h3></div></div>;
}
