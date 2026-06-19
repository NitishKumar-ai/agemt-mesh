import { useTaskQueues } from '../../hooks/useOrchestration';
import { ListTree } from 'lucide-react';

export function TaskQueue() {
  const { data: queues, isLoading } = useTaskQueues();

  return (
    <div className="orchestration-page">
      <div className="page-header">
        <div className="page-header__title">
          <ListTree size={20} />
          <h1>Task Queue Monitor</h1>
        </div>
      </div>

      {isLoading && <div className="loading-state">Loading...</div>}

      {queues && Object.keys(queues).length > 0 && (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Queue Name</th>
                <th>Size</th>
                <th>Unacked</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(queues).map(([name, detail]) => (
                <tr key={name}>
                  <td className="cell-name">{name}</td>
                  <td>{detail.size}</td>
                  <td>{detail.uacked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {queues && Object.keys(queues).length === 0 && (
        <div className="empty-state">
          <ListTree size={40} />
          <h3>No task queues</h3>
        </div>
      )}
    </div>
  );
}
