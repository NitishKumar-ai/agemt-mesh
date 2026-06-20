import { ExternalLink, FileText, ShieldCheck, X } from 'lucide-react';
import type { Citation } from '../lib/types';

export function EvidenceInspector({
  citation,
  index,
  onClose,
}: {
  citation: Citation;
  index: number;
  onClose: () => void;
}) {
  return (
    <aside className="evidence-inspector" aria-label="Source evidence">
      <header>
        <div>
          <span>Evidence {index + 1}</span>
          <h2>{citation.title}</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close evidence">
          <X size={17} />
        </button>
      </header>
      <div className="evidence-inspector__meta">
        <span><ShieldCheck size={14} /> Permission checked</span>
        <span>{Math.round(citation.confidence * 100)}% source confidence</span>
      </div>
      <section>
        <div className="evidence-label"><FileText size={14} /> Supporting passage</div>
        <blockquote>
          {citation.exact_text || 'The source did not return an exact evidence span.'}
        </blockquote>
      </section>
      <dl>
        <div>
          <dt>Source ID</dt>
          <dd>{citation.source_id}</dd>
        </div>
        <div>
          <dt>Access</dt>
          <dd>Visible to your current tenant identity</dd>
        </div>
      </dl>
      {citation.url && (
        <a className="evidence-link" href={citation.url} target="_blank" rel="noreferrer">
          Open original source <ExternalLink size={15} />
        </a>
      )}
    </aside>
  );
}
