import { useEffect, useState } from 'react';
import {
  ArrowRight,
  MessageSquareText,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  deleteSession,
  listSessions,
  timeAgo,
  type ChatSession,
} from '../lib/chatSessions';

/**
 * "Session history" — the list of past chat sessions. Sessions are persisted by
 * the New session chat page (HomePage) in the chatSessions store. Opening one
 * deep-links back into the chat (`/home?session=<id>`) with the full transcript,
 * citations, and confidence restored.
 */
export function AskPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  useEffect(() => {
    setSessions(listSessions());
  }, []);

  function open(id: string) {
    navigate(`/home?session=${encodeURIComponent(id)}`);
  }

  function remove(event: React.MouseEvent, id: string) {
    event.stopPropagation();
    deleteSession(id);
    setSessions(listSessions());
  }

  function preview(session: ChatSession): string {
    const lastAssistant = [...session.messages].reverse().find((m) => m.role === 'assistant' && !m.error);
    if (lastAssistant) return lastAssistant.text;
    const lastUser = [...session.messages].reverse().find((m) => m.role === 'user');
    return lastUser?.text ?? 'No messages yet.';
  }

  return (
    <div className="history-page">
      <header className="history-head">
        <div>
          <span className="history-head__eyebrow"><MessageSquareText size={13} /> Session history</span>
          <h1>Your conversations</h1>
          <p>Every chat with the company brain — reopen one to continue, with its citations and confidence intact.</p>
        </div>
        <button type="button" className="history-new" onClick={() => navigate('/home')}>
          <Plus size={16} /> New chat
        </button>
      </header>

      {sessions.length === 0 ? (
        <button type="button" className="history-empty" onClick={() => navigate('/home')}>
          <MessageSquareText size={22} />
          <span>
            <strong>No conversations yet</strong>
            <small>Start a new session and your chats will show up here.</small>
          </span>
          <ArrowRight size={16} />
        </button>
      ) : (
        <ul className="history-list">
          {sessions.map((session) => {
            const turns = session.messages.filter((m) => m.role === 'user').length;
            return (
              <li key={session.id}>
                <button type="button" className="history-card" onClick={() => open(session.id)}>
                  <div className="history-card__main">
                    <strong className="history-card__title">{session.title}</strong>
                    <p className="history-card__preview">{preview(session)}</p>
                    <div className="history-card__tags">
                      {session.scope && <span className="history-tag">{session.scope}</span>}
                      <span className="history-tag history-tag--soft">
                        {turns} {turns === 1 ? 'question' : 'questions'}
                      </span>
                    </div>
                  </div>
                  <div className="history-card__side">
                    <span className="history-card__time">{timeAgo(session.updatedAt)}</span>
                    <span
                      className="history-card__delete"
                      role="button"
                      tabIndex={0}
                      aria-label="Delete session"
                      onClick={(event) => remove(event, session.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          remove(event as unknown as React.MouseEvent, session.id);
                        }
                      }}
                    >
                      <Trash2 size={15} />
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="history-foot">
        <ShieldCheck size={13} /> Conversations are stored locally on this device for the demo.
      </footer>

      <style>{`
        .history-page {
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-width: 820px;
        }
        .history-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }
        .history-head__eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--muted);
        }
        .history-head__eyebrow svg { color: var(--brand-purple); }
        .history-head h1 { margin: 6px 0 4px; font-size: 26px; letter-spacing: -0.5px; }
        .history-head p { margin: 0; font-size: 13.5px; color: var(--muted); max-width: 520px; line-height: 1.5; }
        .history-new {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 9px 15px;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, var(--brand-purple), var(--brand-blue, var(--brand-purple)));
          color: #fff;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          white-space: nowrap;
          transition: transform 0.15s ease;
        }
        .history-new:hover { transform: translateY(-1px); }
        .history-empty {
          display: flex;
          align-items: center;
          gap: 14px;
          width: 100%;
          text-align: left;
          padding: 22px;
          border: 1px dashed var(--hairline);
          border-radius: 16px;
          background: var(--surface-card);
          cursor: pointer;
          color: var(--ink);
        }
        .history-empty:hover { border-color: color-mix(in srgb, var(--brand-purple) 45%, var(--hairline)); }
        .history-empty svg:first-child { color: var(--brand-purple); flex-shrink: 0; }
        .history-empty span { flex: 1; display: flex; flex-direction: column; gap: 2px; }
        .history-empty strong { font-size: 15px; }
        .history-empty small { font-size: 13px; color: var(--muted); }
        .history-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
        .history-card {
          display: flex;
          align-items: stretch;
          justify-content: space-between;
          gap: 16px;
          width: 100%;
          text-align: left;
          padding: 16px 18px;
          border: 1px solid var(--hairline);
          border-radius: 16px;
          background: var(--surface-card);
          cursor: pointer;
          transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
        }
        .history-card:hover {
          border-color: color-mix(in srgb, var(--brand-purple) 45%, var(--hairline));
          transform: translateY(-1px);
          box-shadow: 0 10px 30px -22px color-mix(in srgb, var(--brand-purple) 70%, transparent);
        }
        .history-card__main { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 6px; }
        .history-card__title {
          font-size: 15px; font-weight: 650; color: var(--ink);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .history-card__preview {
          margin: 0; font-size: 13px; color: var(--muted); line-height: 1.45;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .history-card__tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
        .history-tag {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; font-weight: 600;
          padding: 3px 9px; border-radius: 999px;
          background: var(--canvas); color: var(--muted);
          border: 1px solid var(--hairline);
        }
        .history-tag--identity { color: var(--brand-purple); border-color: color-mix(in srgb, var(--brand-purple) 35%, var(--hairline)); }
        .history-tag--soft { background: transparent; }
        .history-card__side {
          display: flex; flex-direction: column; align-items: flex-end; justify-content: space-between; gap: 10px;
          flex-shrink: 0;
        }
        .history-card__time { font-size: 11.5px; color: var(--muted); white-space: nowrap; }
        .history-card__delete {
          display: inline-grid; place-items: center;
          width: 30px; height: 30px; border-radius: 9px;
          color: var(--muted); cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .history-card__delete:hover { background: color-mix(in srgb, var(--error) 10%, transparent); color: var(--error); }
        .history-foot {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 11.5px; color: var(--muted);
        }
        .history-foot svg { color: var(--brand-teal); }
      `}</style>
    </div>
  );
}
