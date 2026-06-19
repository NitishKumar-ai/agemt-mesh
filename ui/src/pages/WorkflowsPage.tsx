import { useEffect, useState } from 'react';
import { PlayCircle, Search, RefreshCw, Clock } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { api } from '../lib/api';
import type { WorkflowRun } from '../lib/types';

interface WorkflowsPageProps {
  activeWorkflowId: string | null;
  onWorkflowSelect: (id: string | null) => void;
}

function statusColor(status: string) {
  const s = status.toUpperCase();
  if (s === 'COMPLETED' || s === 'SUCCESS') return 'var(--success)';
  if (s === 'FAILED' || s === 'ERROR' || s === 'TIMED_OUT') return 'var(--error)';
  if (s === 'RUNNING' || s === 'EXECUTING') return 'var(--brand-teal)';
  if (s === 'PAUSED' || s === 'SUSPENDED') return 'var(--brand-ochre)';
  return 'var(--muted)';
}

function relTime(iso: string | number) {
  const date = typeof iso === 'number' ? new Date(iso) : new Date(iso);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function WorkflowsPage({ activeWorkflowId, onWorkflowSelect }: WorkflowsPageProps) {
  const [searchId, setSearchId] = useState('');
  const [workflows, setWorkflows] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await api.listWorkflows();
      setWorkflows(res.workflows || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchId.trim()) {
      onWorkflowSelect(searchId.trim());
    }
  };

  return (
    <div className="page page--split">
      <section>
        <PageHeader
          eyebrow="DBOS runs"
          title="Workflows"
          description="Inspect workflow execution and trace tasks."
          actions={
            <button className="secondary-button" onClick={load}>
              <RefreshCw size={14} /> Refresh
            </button>
          }
        />

        <div style={{
          marginBottom: '24px',
          background: 'var(--surface-card, #1c2222)',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid var(--hairline, rgba(255,255,255,0.04))',
        }}>
          <h3 style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 600 }}>Inspect Workflow by ID</h3>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="e.g. wf-12345678"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--hairline, rgba(255,255,255,0.1))',
                background: 'var(--canvas, #151a1a)',
                color: 'var(--ink)',
                fontSize: '13px',
                fontFamily: 'monospace',
              }}
            />
            <button
              type="submit"
              className="primary-button"
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '13px',
              }}
            >
              <Search size={14} />
              Inspect
            </button>
          </form>
        </div>

        <div className="table-card">
          {loading && <div className="empty-card">Loading workflows…</div>}
          {!loading && workflows.length === 0 && (
            <div className="empty-card">No workflow runs found.</div>
          )}
          {!loading && workflows.map((wf) => (
            <article
              className="schedule-row"
              key={wf.run_id}
              style={{
                cursor: 'pointer',
                background: activeWorkflowId === wf.run_id ? 'var(--surface-card)' : undefined,
              }}
              onClick={() => onWorkflowSelect(wf.run_id)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: '14px' }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: statusColor(wf.status),
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {wf.run_id.slice(0, 12)}…
                  </span>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 9999,
                      fontSize: 10,
                      fontWeight: 700,
                      background: statusColor(wf.status),
                      color: 'white',
                    }}
                  >
                    {wf.status}
                  </span>
                  {wf.agent_id && (
                    <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}>
                      · {wf.agent_id}
                    </span>
                  )}
                </h3>
                <small style={{ color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
                  <Clock size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                  Started {relTime(wf.started_at || Date.now())}
                </small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <aside className="form-panel" style={{ overflowY: 'auto' }}>
        {!activeWorkflowId ? (
          <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 24, textAlign: 'center' }}>
            <PlayCircle
              size={28}
              style={{ marginBottom: 10, display: 'inline-block', color: 'var(--muted-soft)' }}
            />
            <p>Select or enter a workflow run to inspect its execution trace.</p>
          </div>
        ) : (
          <div style={{ padding: '12px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PlayCircle size={18} className="text-brand-teal" />
              Workflow Details
            </h3>
            <div style={{
              background: 'var(--canvas)',
              border: '1px solid var(--hairline)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '16px',
            }}>
              <div style={{ marginBottom: '12px' }}>
                <span style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>WORKFLOW ID</span>
                <span style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--ink)' }}>{activeWorkflowId}</span>
              </div>
              {workflows.find(w => w.run_id === activeWorkflowId) && (
                <>
                  <div style={{ marginBottom: '12px' }}>
                    <span style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>AGENT ID</span>
                    <span style={{ fontSize: '13px', color: 'var(--ink)' }}>
                      {workflows.find(w => w.run_id === activeWorkflowId)?.agent_id || 'N/A'}
                    </span>
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <span style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>STATUS</span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 9999,
                        fontSize: 11,
                        fontWeight: 700,
                        background: statusColor(workflows.find(w => w.run_id === activeWorkflowId)!.status),
                        color: 'white',
                        display: 'inline-block',
                        marginTop: '4px',
                      }}
                    >
                      {workflows.find(w => w.run_id === activeWorkflowId)?.status}
                    </span>
                  </div>
                </>
              )}
            </div>
            <button
              className="secondary-button"
              style={{ width: '100%' }}
              onClick={() => onWorkflowSelect(null)}
            >
              Clear Inspector
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

