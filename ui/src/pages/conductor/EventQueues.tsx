import { useEventQueues } from '../../hooks/useOrchestration';
import { RectangleEllipsis } from 'lucide-react';

export function EventQueues() {
  const { data: queues, isLoading } = useEventQueues();

  return (
    <div className="orchestration-page">
      <div className="page-header">
        <div className="page-header__title">
          <RectangleEllipsis size={20} />
          <h1>Event Queues</h1>
        </div>
      </div>

      {isLoading && <div className="loading-state">Loading...</div>}

      {queues && queues.length > 0 && (
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
              {queues.map((q) => (
                <tr key={q.queueName}>
                  <td className="cell-name">{q.queueName}</td>
                  <td>{q.size}</td>
                  <td>{q.unackedCount ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {queues && queues.length === 0 && (
        <div className="empty-state">
          <RectangleEllipsis size={40} />
          <h3>No event queues</h3>
        </div>
      )}
    </div>
  );
}
