import {
  Braces,
  File,
  FileText,
  FolderTree,
  GitPullRequest,
  ListChecks,
  Package,
  ScrollText,
} from 'lucide-react';
import { useState } from 'react';
import type { MeshEvent } from '../lib/types';
import { shortTime } from '../lib/format';

type Tab = 'details' | 'files' | 'diff' | 'logs' | 'artifacts' | 'events';

export function ContextPane({ events, workflowId, onWorkflowSelect }: { events: MeshEvent[]; workflowId?: string; onWorkflowSelect?: (id: string | null) => void }) {
  const [tab, setTab] = useState<Tab>('details');
  const latestApproval = events.find((event) => event.eventType.includes('approval'));

  const tabs: { key: Tab; label: string; icon: typeof ListChecks }[] = [
    { key: 'details', label: 'Details', icon: ListChecks },
    { key: 'files', label: 'Files', icon: FolderTree },
    { key: 'diff', label: 'Diff', icon: GitPullRequest },
    { key: 'logs', label: 'Logs', icon: ScrollText },
    { key: 'artifacts', label: 'Artifacts', icon: Package },
    { key: 'events', label: 'Events', icon: Braces },
  ];

  return (
    <aside className="context-pane">
      <div className="context-tabs">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              className={tab === t.key ? 'active' : ''}
              onClick={() => setTab(t.key)}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'details' && (
        <div className="pane-section">
          <h3>Session details</h3>
          <dl className="detail-list">
            <div>
              <dt>Agent</dt>
              <dd>CommitGuard</dd>
            </div>
            <div>
              <dt>Workflow</dt>
              <dd style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {workflowId ? (
                  <>
                    <span style={{ fontFamily: 'monospace' }}>{workflowId}</span>
                    {onWorkflowSelect && (
                      <button 
                        onClick={() => onWorkflowSelect(workflowId)}
                        style={{
                          padding: '2px 8px',
                          background: 'var(--brand-teal)',
                          border: 'none',
                          borderRadius: '4px',
                          color: '#000',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Inspect
                      </button>
                    )}
                  </>
                ) : (
                  'Not started'
                )}
              </dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>Plan · Execute · Review</dd>
            </div>
            <div>
              <dt>Sandbox</dt>
              <dd>E2B when configured, mock fallback locally</dd>
            </div>
          </dl>
        </div>
      )}

      {tab === 'files' && (
        <div className="pane-section">
          <h3>Files touched</h3>
          {events.length === 0 ? (
            <EmptyPane
              icon={FolderTree}
              text="Files will appear here as the agent modifies your codebase."
            />
          ) : (
            <div className="file-tree">
              {/* Extract unique file paths from events */}
              {Array.from(
                new Set(
                  events
                    .filter((e) => e.payload.file || e.payload.path)
                    .map((e) => String(e.payload.file || e.payload.path)),
                ),
              ).map((filePath) => (
                <div key={filePath} className="file-tree-item">
                  <File size={13} />
                  <span>{filePath}</span>
                </div>
              ))}
              {events.filter((e) => e.payload.file || e.payload.path).length === 0 && (
                <EmptyPane icon={FolderTree} text="No files modified in current events." />
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'diff' && (
        <div className="pane-section">
          <h3>Proposed change</h3>
          {latestApproval ? (
            <pre className="diff-block">
              <span className="diff-add">
                + {String(latestApproval.payload.add ?? 'No additions in current payload')}
              </span>
              <span className="diff-remove">
                - {String(latestApproval.payload.sub ?? 'No removals in current payload')}
              </span>
            </pre>
          ) : (
            <EmptyPane icon={FileText} text="Diffs appear here when an agent asks for approval." />
          )}
        </div>
      )}

      {tab === 'logs' && (
        <div className="pane-section">
          <h3>Sandbox logs</h3>
          <pre className="log-block">
            {events.length
              ? events
                  .map((event) => `[${shortTime(event.time)}] ${event.agentId}: ${event.eventType}`)
                  .join('\n')
              : 'No tool logs yet.'}
          </pre>
        </div>
      )}

      {tab === 'artifacts' && (
        <div className="pane-section">
          <h3>Artifacts</h3>
          <EmptyPane
            icon={Package}
            text="Generated artifacts (reports, patches, exports) will appear here after task completion."
          />
        </div>
      )}

      {tab === 'events' && (
        <div className="pane-section">
          <h3>Raw events</h3>
          <pre className="json-block">{JSON.stringify(events.slice(0, 12), null, 2)}</pre>
        </div>
      )}
    </aside>
  );
}

function EmptyPane({ icon: Icon, text }: { icon: typeof FileText; text: string }) {
  return (
    <div className="empty-pane">
      <Icon size={22} />
      <p>{text}</p>
    </div>
  );
}
