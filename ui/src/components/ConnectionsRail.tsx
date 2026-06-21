import { useEffect, useState } from 'react';
import { Database, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import type { ConnectionInfo } from '../lib/types';
import { ConnectorLogo } from './ConnectorLogo';

/**
 * Read-only listing of connected sources, shown alongside the chat surface to
 * reinforce that every answer is grounded in connected knowledge. Connect /
 * disconnect lives on the Sources page (owned elsewhere) — this is display only.
 */
export function ConnectionsRail() {
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .listConnections()
      .then((result) => {
        if (!cancelled) setConnections(result.connections ?? []);
      })
      .catch(() => {
        if (!cancelled) setConnections([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = connections.filter((connection) => connection.status === 'connected').length;

  return (
    <aside className="connections-rail" aria-label="Connected sources">
      <header className="connections-rail__head">
        <div className="connections-rail__title">
          <Database size={15} />
          <span>Connected sources</span>
        </div>
        <span className="connections-rail__count">
          {ready} source{ready === 1 ? '' : 's'} ready
        </span>
      </header>

      {loading ? (
        <div className="connections-rail__state">Checking connected knowledge…</div>
      ) : connections.length === 0 ? (
        <div className="connections-rail__empty">
          <strong>No sources connected yet.</strong>
          <span>Answers stay grounded — AgentMesh abstains when evidence is missing.</span>
        </div>
      ) : (
        <ul className="connections-rail__list">
          {connections.map((connection) => {
            const name = connection.metadata?.name || connection.provider_id || 'Source';
            const isReady = connection.status === 'connected';
            return (
              <li key={connection.id || connection.provider_id} className="connections-rail__item">
                <span className="connections-rail__logo">
                  <ConnectorLogo providerId={connection.provider_id} size={16} />
                </span>
                <span className="connections-rail__meta">
                  <strong>{name}</strong>
                  <small>{isReady ? 'Ready for retrieval' : connection.status}</small>
                </span>
                <span
                  className={`connections-rail__dot connections-rail__dot--${isReady ? 'on' : 'off'}`}
                  title={isReady ? 'Connected' : String(connection.status)}
                />
              </li>
            );
          })}
        </ul>
      )}

      <footer className="connections-rail__foot">
        <ShieldCheck size={13} /> Grounded in permitted sources only.
      </footer>

      <style>{`
        .connections-rail {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 18px;
          border: 1px solid var(--hairline);
          border-radius: 18px;
          background: var(--surface-card);
          align-self: flex-start;
          position: sticky;
          top: 24px;
        }
        .connections-rail__head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .connections-rail__title {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-weight: 600;
          font-size: 13px;
          color: var(--ink);
        }
        .connections-rail__title svg { color: var(--brand-teal); }
        .connections-rail__count {
          font-size: 11px;
          font-weight: 600;
          color: var(--brand-teal);
          background: color-mix(in srgb, var(--brand-teal) 12%, transparent);
          padding: 3px 9px;
          border-radius: 999px;
          white-space: nowrap;
        }
        .connections-rail__state,
        .connections-rail__empty {
          font-size: 12.5px;
          color: var(--muted);
          line-height: 1.5;
        }
        .connections-rail__empty {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .connections-rail__empty strong { color: var(--ink); font-size: 13px; }
        .connections-rail__list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .connections-rail__item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 9px;
          border-radius: 12px;
          transition: background 0.15s ease;
        }
        .connections-rail__item:hover { background: var(--canvas); }
        .connections-rail__logo {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          border-radius: 9px;
          background: var(--canvas);
          color: var(--ink);
          flex-shrink: 0;
        }
        .connections-rail__meta {
          display: flex;
          flex-direction: column;
          gap: 1px;
          min-width: 0;
          flex: 1;
        }
        .connections-rail__meta strong {
          font-size: 13px;
          font-weight: 600;
          color: var(--ink);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .connections-rail__meta small {
          font-size: 11px;
          color: var(--muted);
          text-transform: capitalize;
        }
        .connections-rail__dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .connections-rail__dot--on {
          background: var(--success);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 22%, transparent);
        }
        .connections-rail__dot--off {
          background: var(--muted);
          opacity: 0.5;
        }
        .connections-rail__foot {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: var(--muted);
          padding-top: 10px;
          border-top: 1px solid var(--hairline);
        }
        .connections-rail__foot svg { color: var(--brand-teal); }
      `}</style>
    </aside>
  );
}
