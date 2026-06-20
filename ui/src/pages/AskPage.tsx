import { useState } from 'react';
import { AlertTriangle, ExternalLink, Search, Sparkles } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { api } from '../lib/api';
import type { AskAnswer } from '../lib/types';

const LEVEL_META: Record<AskAnswer['level'], { label: string; bg: string; fg: string }> = {
  high: { label: 'High confidence', bg: 'rgba(34,197,94,.1)', fg: 'var(--success)' },
  medium: { label: 'Medium confidence', bg: 'rgba(232,185,74,.1)', fg: 'var(--brand-ochre)' },
  low: { label: 'Low confidence', bg: 'rgba(239,68,68,.08)', fg: 'var(--error)' },
  abstain: { label: 'Abstained', bg: 'rgba(239,68,68,.08)', fg: 'var(--error)' },
};

export function AskPage() {
  const [entityId, setEntityId] = useState('');
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ query: string; entityId: string; answer: AskAnswer }>>([]);

  async function ask() {
    if (!query.trim() || !entityId.trim()) {
      setError('Both a question and an entity/project scope are required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.askQuestion(query.trim(), entityId.trim());
      setAnswer(result);
      setHistory((h) => [{ query: query.trim(), entityId: entityId.trim(), answer: result }, ...h].slice(0, 10));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Query failed');
      setAnswer(null);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void ask();
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Company brain"
        title="Ask"
        description="Ask a question about an entity or project and get a cited, confidence-scored answer from the knowledge graph."
      />

      <form className="ask-form" onSubmit={onSubmit}>
        <div className="form-group">
          <label className="form-label">Entity / Project scope</label>
          <input
            className="form-input"
            placeholder="e.g. project_payments, team_platform"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
          />
          <p className="form-hint">
            The answer is scoped to facts recorded against this exact entity ID — the query below is not yet
            semantically searched across the whole graph.
          </p>
        </div>

        <div className="form-group">
          <label className="form-label">Question</label>
          <textarea
            className="form-input"
            rows={3}
            placeholder="What changed in this project this week?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {error && <div className="error-box">{error}</div>}

        <button className="primary-button" type="submit" disabled={loading}>
          <Search size={14} /> {loading ? 'Asking…' : 'Ask'}
        </button>
      </form>

      {answer && (
        <div className="answer-card">
          <div className="answer-header">
            <Sparkles size={16} />
            <span
              className="level-badge"
              style={{ background: LEVEL_META[answer.level].bg, color: LEVEL_META[answer.level].fg }}
            >
              {LEVEL_META[answer.level].label} · {Math.round(answer.confidence * 100)}%
            </span>
          </div>

          {answer.level === 'abstain' && (
            <div className="abstain-notice">
              <AlertTriangle size={14} />
              The system abstained rather than guess — treat this answer as informational only.
            </div>
          )}

          <p className="answer-text">{answer.answer}</p>

          {answer.citations.length > 0 && (
            <div className="citations">
              <h4 className="citations-title">Sources ({answer.citations.length})</h4>
              <ul className="citation-list">
                {answer.citations.map((c) => (
                  <li key={c.id} className="citation-item">
                    <div className="citation-main">
                      <span className="citation-title">{c.title}</span>
                      {c.url && (
                        <a href={c.url} target="_blank" rel="noreferrer" className="citation-link">
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                    {c.exact_text && <p className="citation-quote">"{c.exact_text}"</p>}
                    <span className="citation-confidence">{Math.round(c.confidence * 100)}% confidence</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {history.length > 1 && (
        <div className="history">
          <h3 className="section-title">Recent questions</h3>
          {history.slice(1).map((h, i) => (
            <button
              key={i}
              className="history-item"
              onClick={() => {
                setEntityId(h.entityId);
                setQuery(h.query);
                setAnswer(h.answer);
              }}
            >
              <span className="history-query">{h.query}</span>
              <span className="history-scope">{h.entityId}</span>
            </button>
          ))}
        </div>
      )}

      <style>{`
        .ask-form {
          max-width: 640px;
          margin-bottom: 28px;
        }
        .form-group {
          margin-bottom: 16px;
        }
        .form-label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 6px;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .form-hint {
          font-size: 12px;
          color: var(--muted);
          margin: 6px 0 0;
          line-height: 1.4;
        }
        .form-input {
          width: 100%;
          padding: 10px 14px;
          border-radius: 12px;
          border: 1px solid var(--hairline);
          font-size: 14px;
          background: var(--canvas);
          color: var(--ink);
          font-family: inherit;
          resize: vertical;
        }
        .error-box {
          padding: 10px 14px;
          border-radius: 12px;
          background: rgba(239,68,68,.06);
          color: var(--error);
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 14px;
          border: 1px solid rgba(239,68,68,.2);
        }
        .answer-card {
          max-width: 720px;
          border: 1px solid var(--hairline);
          border-radius: 16px;
          padding: 22px 24px;
          margin-bottom: 28px;
        }
        .answer-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
        }
        .level-badge {
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 600;
        }
        .abstain-notice {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: var(--error);
          background: rgba(239,68,68,.06);
          border: 1px solid rgba(239,68,68,.2);
          border-radius: 10px;
          padding: 8px 12px;
          margin-bottom: 14px;
        }
        .answer-text {
          font-size: 15px;
          line-height: 1.6;
          margin: 0 0 18px;
        }
        .citations-title {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--muted);
          margin: 0 0 10px;
        }
        .citation-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .citation-item {
          border: 1px solid var(--hairline);
          border-radius: 10px;
          padding: 10px 12px;
        }
        .citation-main {
          display: flex;
          align-items: center;
          gap: 8px;
          justify-content: space-between;
        }
        .citation-title {
          font-size: 13px;
          font-weight: 600;
        }
        .citation-link {
          color: var(--muted);
        }
        .citation-quote {
          font-size: 12px;
          color: var(--muted);
          margin: 6px 0 0;
          font-style: italic;
        }
        .citation-confidence {
          display: block;
          font-size: 11px;
          color: var(--muted);
          margin-top: 6px;
        }
        .section-title {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 12px;
          letter-spacing: 1.5px;
        }
        .history {
          max-width: 720px;
        }
        .history-item {
          display: flex;
          justify-content: space-between;
          width: 100%;
          text-align: left;
          padding: 10px 14px;
          border: 1px solid var(--hairline);
          border-radius: 10px;
          background: var(--canvas);
          color: var(--ink);
          cursor: pointer;
          margin-bottom: 8px;
          font-size: 13px;
        }
        .history-item:hover {
          border-color: var(--brand-teal);
        }
        .history-scope {
          color: var(--muted);
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}
