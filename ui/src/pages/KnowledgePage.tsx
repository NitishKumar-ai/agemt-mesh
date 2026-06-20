import { useEffect, useMemo, useState } from 'react';
import { FileText, Network, Search, ShieldCheck } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { fetchDocuments, fetchFacts } from '../lib/api';

type KnowledgeRecord = Record<string, unknown>;

function label(record: KnowledgeRecord, fallback: string) {
  return String(
    record.canonical_name ||
      record.title ||
      record.name ||
      record.entity_id ||
      record.id ||
      fallback,
  );
}

export function KnowledgePage() {
  const [documents, setDocuments] = useState<KnowledgeRecord[]>([]);
  const [facts, setFacts] = useState<KnowledgeRecord[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([fetchDocuments(), fetchFacts()])
      .then(([nextDocuments, nextFacts]) => {
        setDocuments(nextDocuments);
        setFacts(nextFacts);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Knowledge could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  const visibleFacts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return facts;
    return facts.filter((fact) => JSON.stringify(fact).toLowerCase().includes(normalized));
  }, [facts, query]);

  return (
    <div className="page knowledge-page">
      <PageHeader
        eyebrow="Permission-aware memory"
        title="Knowledge"
        description="Inspect current facts and their supporting source material."
      />

      <div className="knowledge-toolbar">
        <Search size={16} />
        <label className="sr-only" htmlFor="knowledge-search">Search knowledge</label>
        <input
          id="knowledge-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search facts, entities, and decisions"
        />
        <span>{visibleFacts.length} visible facts</span>
      </div>

      {loading && <div className="state-row">Loading permission-visible knowledge…</div>}
      {error && <div className="product-error" role="alert">{error}</div>}

      {!loading && !error && (
        <div className="knowledge-layout">
          <section>
            <div className="section-heading section-heading--compact">
              <div>
                <span>Current state</span>
                <h2>Facts</h2>
              </div>
              <Network size={18} />
            </div>
            <div className="knowledge-list">
              {visibleFacts.length === 0 && <div className="state-row">No facts match this search.</div>}
              {visibleFacts.slice(0, 100).map((fact, index) => (
                <article key={String(fact.id || index)}>
                  <span className="knowledge-list__index">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{label(fact, `Fact ${index + 1}`)}</strong>
                    <p>{String(fact.value || fact.content || fact.text || fact.description || 'No summary available.')}</p>
                    <small><ShieldCheck size={12} /> Permission-visible current record</small>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <aside>
            <div className="section-heading section-heading--compact">
              <div>
                <span>Provenance</span>
                <h2>Sources</h2>
              </div>
              <FileText size={18} />
            </div>
            <div className="source-document-list">
              {documents.length === 0 && <div className="state-row">No source documents available.</div>}
              {documents.slice(0, 30).map((document, index) => (
                <article key={String(document.id || index)}>
                  <FileText size={16} />
                  <div>
                    <strong>{label(document, `Source ${index + 1}`)}</strong>
                    <small>{String(document.source_system || document.type || 'Connected source')}</small>
                  </div>
                </article>
              ))}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
