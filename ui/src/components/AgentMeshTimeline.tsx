import React, { useState, useEffect } from 'react';
import { fetchDocuments, fetchFacts, resolveConflict } from '../lib/api';

// Type definitions (could be imported from a shared types file)
interface SourceDocument {
  id: string;
  title: string;
  status: string; // e.g., 'synced', 'conflict'
}

interface Fact {
  id: string;
  text: string;
  status: 'ACTIVE' | 'PENDING' | 'RESOLVED';
}

/**
 * AgentMeshTimeline component – displays a two‑column master‑detail view of ingested
 * documents and their citation fact timeline.
 *
 * Layout follows the Cal.com visual style guide defined in `app.css`:
 *   • Document sidebar – surface‑card background, 320px width, collapses on small screens.
 *   • Main fact timeline – white canvas background with surface‑card rows.
 *   • Conflict resolution drawer – slides in from the right.
 */
export const AgentMeshTimeline: React.FC = () => {
  const [documents, setDocuments] = useState<SourceDocument[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<SourceDocument | null>(null);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [loadingFacts, setLoadingFacts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConflictDrawer, setShowConflictDrawer] = useState(false);
  const [conflictFact, setConflictFact] = useState<Fact | null>(null);

  // Load documents on mount
  useEffect(() => {
    async function load() {
      try {
        const docs = await fetchDocuments();
        setDocuments(docs);
        setLoadingDocs(false);
      } catch (e) {
        setError('Failed to load documents');
        setLoadingDocs(false);
      }
    }
    load();
  }, []);

  // Load facts whenever a document is selected
  useEffect(() => {
    if (!selectedDoc) return;
    const docId = selectedDoc.id;
    setLoadingFacts(true);
    async function load() {
      try {
        const f = await fetchFacts(docId);
        setFacts(f);
        setLoadingFacts(false);
      } catch (e) {
        setError('Failed to load facts');
        setLoadingFacts(false);
      }
    }
    load();
  }, [selectedDoc]);

  const openConflictDrawer = (fact: Fact) => {
    setConflictFact(fact);
    setShowConflictDrawer(true);
  };

  const handleResolve = async (resolution: 'accept' | 'reject') => {
    if (!conflictFact) return;
    const docId = selectedDoc?.id;
    try {
      await resolveConflict(conflictFact.id, resolution);
      // Refresh facts after resolution
      if (docId) {
        const refreshed = await fetchFacts(docId);
        setFacts(refreshed);
      }
    } catch (e) {
      setError('Failed to resolve conflict');
    } finally {
      setShowConflictDrawer(false);
      setConflictFact(null);
    }
  };

  return (
    <div className="agentmesh-timeline running-layout" style={{ display: 'flex', gap: 'var(--sp-md)' }}>
      {/* Document Sidebar */}
      <aside
        className="document-sidebar"
        style={{
          width: '320px',
          background: 'var(--surface-card)',
          borderRadius: 'var(--r-md)',
          padding: 'var(--sp-md)',
          overflowY: 'auto',
        }}
      >
        <input
          type="search"
          placeholder="Search documents…"
          className="search-bar"
          style={{ width: '100%' }}
        />
        {loadingDocs ? (
          <div className="skeleton-list" style={{ marginTop: 'var(--sp-sm)' }}>
            Loading documents…
          </div>
        ) : error ? (
          <div className="error-text">{error}</div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, marginTop: 'var(--sp-sm)' }}>
            {documents.map((doc) => (
              <li
                key={doc.id}
                onClick={() => setSelectedDoc(doc)}
                style={{
                  padding: 'var(--sp-xs)',
                  borderRadius: 'var(--r-sm)',
                  cursor: 'pointer',
                  background:
                    selectedDoc?.id === doc.id ? 'var(--surface-strong)' : 'transparent',
                }}
              >
                <strong>{doc.title}</strong>
                <span style={{ float: 'right', fontSize: '0.85rem', opacity: 0.8 }}>
                  {doc.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* Main Fact Timeline */}
      <section
        className="fact-timeline"
        style={{
          flex: 1,
          background: 'var(--canvas)',
          borderRadius: 'var(--r-md)',
          padding: 'var(--sp-md)',
        }}
      >
        {selectedDoc ? (
          loadingFacts ? (
            <div className="skeleton-table">Loading facts…</div>
          ) : (
            <table className="data-table-wrapper" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Fact ID</th>
                  <th>Text</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {facts.map((fact) => (
                  <tr key={fact.id}>
                    <td>{fact.id}</td>
                    <td>{fact.text}</td>
                    <td>{fact.status}</td>
                    <td>
                      {fact.status === 'PENDING' && (
                        <button
                          className="btn btn--ghost btn--sm"
                          onClick={() => openConflictDrawer(fact)}
                        >
                          Resolve
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          <div className="empty-state" style={{ textAlign: 'center', marginTop: 'var(--sp-lg)' }}>
            Select a document from the sidebar to view its citation timeline.
          </div>
        )}
      </section>

      {/* Conflict Resolution Drawer */}
      {showConflictDrawer && conflictFact && (
        <div
          className="conflict-drawer"
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            height: '100vh',
            width: '400px',
            background: 'var(--surface-card)',
            boxShadow: '-4px 0 12px rgba(0,0,0,0.2)',
            padding: 'var(--sp-md)',
            overflowY: 'auto',
          }}
        >
          <h2>Resolve Conflict</h2>
          <p>{conflictFact.text}</p>
          <div style={{ marginTop: 'var(--sp-md)' }}>
            <button className="btn btn--primary" onClick={() => handleResolve('accept')}>
              Accept
            </button>
            <button className="btn btn--ghost" style={{ marginLeft: 'var(--sp-sm)' }} onClick={() => handleResolve('reject')}>
              Reject
            </button>
          </div>
          <button
            className="btn btn--ghost"
            style={{ position: 'absolute', top: 'var(--sp-sm)', right: 'var(--sp-sm)' }}
            onClick={() => setShowConflictDrawer(false)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};

export default AgentMeshTimeline;
