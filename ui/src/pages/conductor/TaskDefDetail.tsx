import { useParams } from 'react-router-dom';
import { useTaskDef } from '../../hooks/useOrchestration';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function TaskDefDetail() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { data: def, isLoading, error } = useTaskDef(name || '');

  if (isLoading) return <div className="loading-state">Loading...</div>;
  if (error) return <div className="error-state">{(error as Error).message}</div>;
  if (!def) return <div className="error-state">Task definition not found</div>;

  return (
    <div className="orchestration-page">
      <div className="page-header">
        <div className="page-header__title">
          <button className="btn btn--ghost" type="button" onClick={() => navigate('/tasks/definitions')}>
            <ArrowLeft size={16} />
          </button>
          <CheckCircle2 size={20} />
          <h1>{def.name}</h1>
        </div>
      </div>

      <div className="detail-grid">
        <section className="detail-section">
          <h2>Details</h2>
          <dl className="detail-list">
            <dt>Description</dt><dd>{def.description || '—'}</dd>
            <dt>Owner</dt><dd>{def.ownerEmail || '—'}</dd>
            <dt>Retry Count</dt><dd>{def.retryCount ?? 3}</dd>
            <dt>Timeout Policy</dt><dd>{def.timeoutPolicy || 'TIME_OUT_WF'}</dd>
            <dt>Timeout (s)</dt><dd>{def.timeoutSeconds ?? 0}</dd>
            <dt>Response Timeout (s)</dt><dd>{def.responseTimeoutSeconds ?? 3600}</dd>
            <dt>Retry Logic</dt><dd>{def.retryLogic || 'FIXED'}</dd>
            <dt>Retry Delay (s)</dt><dd>{def.retryDelaySeconds ?? 60}</dd>
            <dt>Concurrent Exec Limit</dt><dd>{def.concurrentExecLimit ?? 'Unlimited'}</dd>
            <dt>Rate Limit (per freq)</dt><dd>{def.rateLimitPerFrequency ?? '—'}</dd>
          </dl>
        </section>
      </div>

      <section className="detail-section">
        <h2>JSON Definition</h2>
        <pre className="json-block">{JSON.stringify(def, null, 2)}</pre>
      </section>
    </div>
  );
}
