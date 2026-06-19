import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Play, Pause, RefreshCw, X, Clock, HelpCircle, FileText } from 'lucide-react';
import { serverLiteApi } from '../lib/serverLiteApi';
import type { WorkflowDetail, TaskSummary } from '../lib/serverLiteTypes';

interface WorkflowInspectorProps {
  workflowId: string | null;
  onClose: () => void;
}

export function WorkflowInspector({ workflowId, onClose }: WorkflowInspectorProps) {
  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function loadDetails() {
    if (!workflowId) return;
    setLoading(true);
    setError(null);
    try {
      const details = await serverLiteApi.getWorkflow(workflowId);
      setWorkflow(details);
    } catch (err: any) {
      setError(err.message || 'Failed to load workflow details');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDetails();
  }, [workflowId]);

  if (!workflowId) return null;

  async function handleAction(action: 'pause' | 'resume' | 'retry') {
    setActionPending(action);
    setActionError(null);
    try {
      if (action === 'pause') {
        await serverLiteApi.pauseWorkflow(workflowId!);
      } else if (action === 'resume') {
        await serverLiteApi.resumeWorkflow(workflowId!);
      } else if (action === 'retry') {
        await serverLiteApi.retryWorkflow(workflowId!);
      }
      await loadDetails();
    } catch (err: any) {
      setActionError(err.message || `Failed to ${action} workflow`);
    } finally {
      setActionPending(null);
    }
  }

  function getStatusStyle(status: string) {
    const s = status?.toUpperCase();
    if (s === 'COMPLETED') return { color: 'var(--success)', icon: CheckCircle2, bg: 'rgba(34,197,94,.08)' };
    if (s === 'FAILED' || s === 'TERMINATED') return { color: 'var(--error)', icon: AlertCircle, bg: 'rgba(239,68,68,.06)' };
    if (s === 'PAUSED') return { color: 'var(--muted)', icon: Pause, bg: 'rgba(255,255,255,.05)' };
    return { color: 'var(--brand-teal)', icon: RefreshCw, bg: 'rgba(26,58,58,.06)' };
  }

  const statusInfo = workflow ? getStatusStyle(workflow.status) : null;
  const StatusIcon = statusInfo?.icon || HelpCircle;

  return (
    <div className="inspector-panel" style={{
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      width: '450px',
      background: 'var(--surface-overlay, #151a1a)',
      borderLeft: '1px solid var(--border, rgba(255,255,255,0.08))',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      color: 'var(--ink)',
      boxShadow: '-4px 0 24px rgba(0,0,0,0.4)',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border, rgba(255,255,255,0.08))',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Workflow execution
          </div>
          <div style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'monospace' }}>
            {workflowId.slice(0, 18)}...
          </div>
        </div>
        <button 
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 0,
            color: 'var(--muted)',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Main Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
            <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--brand-teal)' }} />
          </div>
        )}

        {error && (
          <div style={{
            padding: '12px 16px',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid var(--error)',
            borderRadius: '6px',
            color: 'var(--error)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {workflow && (
          <div>
            {/* Status and actions card */}
            <div style={{
              background: 'var(--surface-card, #1c2222)',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Status</span>
                <span style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: statusInfo?.color,
                  background: statusInfo?.bg,
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 600,
                }}>
                  <StatusIcon size={12} />
                  {workflow.status}
                </span>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '8px' }}>
                {workflow.status === 'RUNNING' && (
                  <button
                    disabled={!!actionPending}
                    onClick={() => handleAction('pause')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      color: 'var(--ink)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      fontSize: '13px',
                    }}
                  >
                    <Pause size={14} />
                    {actionPending === 'pause' ? 'Pausing...' : 'Pause'}
                  </button>
                )}
                {workflow.status === 'PAUSED' && (
                  <button
                    disabled={!!actionPending}
                    onClick={() => handleAction('resume')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      background: 'var(--brand-teal)',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#000',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      fontSize: '13px',
                    }}
                  >
                    <Play size={14} fill="#000" />
                    {actionPending === 'resume' ? 'Resuming...' : 'Resume'}
                  </button>
                )}
                {(workflow.status === 'FAILED' || workflow.status === 'TERMINATED') && (
                  <button
                    disabled={!!actionPending}
                    onClick={() => handleAction('retry')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      background: 'var(--brand-teal)',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#000',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      fontSize: '13px',
                    }}
                  >
                    <RefreshCw size={14} />
                    {actionPending === 'retry' ? 'Retrying...' : 'Retry'}
                  </button>
                )}
              </div>

              {actionError && (
                <div style={{ color: 'var(--error)', fontSize: '12px', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertCircle size={12} />
                  <span>{actionError}</span>
                </div>
              )}
            </div>

            {/* Timing details */}
            <div style={{ marginBottom: '24px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ color: 'var(--muted)' }}>Type</span>
                <span style={{ fontFamily: 'monospace' }}>{workflow.type}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ color: 'var(--muted)' }}>Started</span>
                <span>{workflow.startedAt ? new Date(workflow.startedAt).toLocaleString() : 'N/A'}</span>
              </div>
              {workflow.endedAt && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ color: 'var(--muted)' }}>Ended</span>
                  <span>{new Date(workflow.endedAt).toLocaleString()}</span>
                </div>
              )}
              {workflow.failureReason && (
                <div style={{ padding: '8px 0', color: 'var(--error)' }}>
                  <div style={{ fontWeight: 600, marginBottom: '2px' }}>Failure Reason</div>
                  <div style={{ fontSize: '12px', background: 'rgba(239,68,68,0.05)', padding: '8px', borderRadius: '4px', border: '1px solid rgba(239,68,68,0.2)' }}>
                    {workflow.failureReason}
                  </div>
                </div>
              )}
            </div>

            {/* Task list section */}
            <div style={{ marginTop: '24px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileText size={16} style={{ color: 'var(--brand-teal)' }} />
                Tasks ({workflow.tasks?.length || 0})
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {workflow.tasks?.map((task: TaskSummary) => {
                  const taskStatus = getStatusStyle(task.status);
                  const TaskIcon = taskStatus.icon;
                  return (
                    <div 
                      key={task.id} 
                      style={{
                        background: 'var(--surface-card, #1c2222)',
                        border: '1px solid rgba(255,255,255,0.04)',
                        borderRadius: '6px',
                        padding: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'monospace' }}>
                          {task.referenceName}
                        </span>
                        <span style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          color: taskStatus.color,
                          fontSize: '11px',
                          fontWeight: 600,
                        }}>
                          <TaskIcon size={10} />
                          {task.status}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)' }}>
                        <span>Type: {task.type}</span>
                        {task.startedAt ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Clock size={10} />
                            {new Date(task.startedAt).toLocaleTimeString()}
                          </span>
                        ) : null}
                      </div>

                      {/* Display task output if completed or failed */}
                      {task.output && Object.keys(task.output).length > 0 && (
                        <div style={{
                          marginTop: '8px',
                          fontSize: '11px',
                          background: 'rgba(0,0,0,0.2)',
                          padding: '6px',
                          borderRadius: '4px',
                          fontFamily: 'monospace',
                          overflowX: 'auto',
                        }}>
                          <strong>Output:</strong> {JSON.stringify(task.output)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
