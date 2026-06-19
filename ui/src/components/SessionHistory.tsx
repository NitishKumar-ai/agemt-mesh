import { useEffect, useMemo, useState, useRef } from 'react';
import { Clock, MessageSquare, MoreHorizontal, Pencil, Search, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import type { AgentSession } from '../lib/types';

type Props = {
  activeSessionId: string | null;
  onSelect: (runId: string) => void;
};

function statusDot(status: string) {
  if (status === 'success' || status === 'completed') return 'var(--success)';
  if (status === 'failed' || status === 'error') return 'var(--error)';
  if (status === 'running' || status === 'executing') return 'var(--brand-teal)';
  if (status === 'blocked') return 'var(--brand-ochre)';
  return 'var(--muted-soft)';
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function groupByDate(sessions: AgentSession[]): { label: string; items: AgentSession[] }[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const weekStart = todayStart - 7 * 86_400_000;

  const today: AgentSession[] = [];
  const yesterday: AgentSession[] = [];
  const week: AgentSession[] = [];
  const older: AgentSession[] = [];

  for (const s of sessions) {
    const t = new Date(s.started_at).getTime();
    if (t >= todayStart) today.push(s);
    else if (t >= yesterdayStart) yesterday.push(s);
    else if (t >= weekStart) week.push(s);
    else older.push(s);
  }

  const groups: { label: string; items: AgentSession[] }[] = [];
  if (today.length) groups.push({ label: 'Today', items: today });
  if (yesterday.length) groups.push({ label: 'Yesterday', items: yesterday });
  if (week.length) groups.push({ label: 'Previous 7 days', items: week });
  if (older.length) groups.push({ label: 'Older', items: older });
  return groups;
}

export function SessionHistory({ activeSessionId, onSelect }: Props) {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (renaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renaming]);

  async function loadSessions() {
    try {
      const res = await api.listSessions();
      setSessions(
        res.sessions.sort(
          (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
        ),
      );
    } catch {
      /* keep stale data */
    }
  }

  function getTitle(s: AgentSession) {
    const stored = api.getSessionTitle(s.run_id);
    if (stored) return stored;
    // Derive title from last_step or agent_id
    if (s.last_step && s.last_step !== 'start') {
      return s.last_step.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return `${s.agent_id} session`;
  }

  function startRename(runId: string) {
    const session = sessions.find((s) => s.run_id === runId);
    if (!session) return;
    setRenameValue(getTitle(session));
    setRenaming(runId);
    setMenuOpen(null);
  }

  function commitRename() {
    if (renaming && renameValue.trim()) {
      api.setSessionTitle(renaming, renameValue.trim());
    }
    setRenaming(null);
  }

  function deleteSession(runId: string) {
    api.deleteSessionTitle(runId);
    setSessions((prev) => prev.filter((s) => s.run_id !== runId));
    setMenuOpen(null);
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return sessions;
    const q = search.toLowerCase();
    return sessions.filter((s) => {
      const title = getTitle(s).toLowerCase();
      return (
        title.includes(q) ||
        s.agent_id.toLowerCase().includes(q) ||
        s.run_id.toLowerCase().includes(q)
      );
    });
  }, [sessions, search]);

  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  return (
    <div className="session-history">
      {/* Search */}
      <div className="session-search">
        <Search size={13} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sessions…"
        />
        {search && (
          <button className="session-search-clear" onClick={() => setSearch('')}>
            <X size={11} />
          </button>
        )}
      </div>

      {/* Session list */}
      <div className="session-list">
        {groups.length === 0 && (
          <div className="session-empty">
            <MessageSquare size={20} />
            <span>No sessions yet</span>
          </div>
        )}

        {groups.map((group) => (
          <div key={group.label} className="session-group">
            <div className="session-group-header">{group.label}</div>
            {group.items.map((s) => (
              <div
                key={s.run_id}
                className={`session-item ${activeSessionId === s.run_id ? 'session-item--active' : ''}`}
                onClick={() => onSelect(s.run_id)}
              >
                <span className="session-status-dot" style={{ background: statusDot(s.status) }} />
                <div className="session-item-content">
                  {renaming === s.run_id ? (
                    <input
                      ref={renameRef}
                      className="session-rename-input"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="session-title">{getTitle(s)}</span>
                  )}
                  <span className="session-meta">
                    <Clock size={10} />
                    {relTime(s.started_at)} · {s.step_count} step{s.step_count !== 1 ? 's' : ''}
                  </span>
                </div>

                <button
                  className="session-menu-trigger"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(menuOpen === s.run_id ? null : s.run_id);
                  }}
                >
                  <MoreHorizontal size={14} />
                </button>

                {menuOpen === s.run_id && (
                  <div className="session-menu" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => startRename(s.run_id)}>
                      <Pencil size={12} /> Rename
                    </button>
                    <button className="session-menu-delete" onClick={() => deleteSession(s.run_id)}>
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
