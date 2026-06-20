import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  CheckCircle2,
  Clock3,
  Quote,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { EvidenceInspector } from '../components/EvidenceInspector';
import { api } from '../lib/api';
import type { AskAnswer, Citation } from '../lib/types';

const LEVEL_META: Record<
  AskAnswer['level'],
  { label: string; description: string; icon: typeof CheckCircle2 }
> = {
  high: {
    label: 'High confidence',
    description: 'Multiple strong signals support this answer.',
    icon: CheckCircle2,
  },
  medium: {
    label: 'Medium confidence',
    description: 'Useful evidence exists, but some context may be incomplete.',
    icon: ShieldCheck,
  },
  low: {
    label: 'Low confidence',
    description: 'Evidence is limited or contains unresolved uncertainty.',
    icon: AlertTriangle,
  },
  abstain: {
    label: 'AgentMesh abstained',
    description: 'There is not enough reliable evidence to answer safely.',
    icon: AlertTriangle,
  },
};

const suggestions = [
  'What changed in this project this week?',
  'Which decision is the current source of truth?',
  'Who owns the open risks and follow-ups?',
];

export function AskPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [scope, setScope] = useState(searchParams.get('scope') || '');
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const citationIndex = useMemo(
    () => answer?.citations.findIndex((citation) => citation.id === selectedCitation?.id) ?? -1,
    [answer, selectedCitation],
  );

  useEffect(() => {
    const initialQuestion = searchParams.get('q');
    const initialScope = searchParams.get('scope');
    if (initialQuestion) setQuery(initialQuestion);
    if (initialScope) setScope(initialScope);
  }, [searchParams]);

  async function ask(question = query) {
    const cleanQuestion = question.trim();
    const cleanScope = scope.trim();
    if (!cleanQuestion) {
      setError('Enter a question for AgentMesh.');
      return;
    }
    if (!cleanScope) {
      setError('Add a project or entity scope while global semantic search is being connected.');
      return;
    }

    setLoading(true);
    setError(null);
    setAnswer(null);
    setSelectedCitation(null);
    setSearchParams({ q: cleanQuestion, scope: cleanScope });
    try {
      const result = await api.askQuestion(cleanQuestion, cleanScope);
      setAnswer(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AgentMesh could not complete the query.');
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask();
  }

  const level = answer ? LEVEL_META[answer.level] : null;
  const LevelIcon = level?.icon;

  return (
    <div className={`ask-workspace ${selectedCitation ? 'ask-workspace--evidence-open' : ''}`}>
      <main className="ask-main">
        <header className="ask-header">
          <span>Company brain</span>
          <h1>Ask AgentMesh</h1>
          <p>Answers are grounded in evidence visible to your current identity.</p>
        </header>

        {!answer && !loading && (
          <section className="ask-intro" aria-label="Suggested questions">
            <div className="ask-intro__mark"><Sparkles size={24} /></div>
            <h2>What do you need to know?</h2>
            <p>
              Ask about a project, decision, incident, account, or team. AgentMesh will abstain
              when the available evidence is not strong enough.
            </p>
            <div className="ask-suggestions">
              {suggestions.map((suggestion) => (
                <button type="button" key={suggestion} onClick={() => setQuery(suggestion)}>
                  {suggestion}
                  <ArrowUp size={14} />
                </button>
              ))}
            </div>
          </section>
        )}

        {loading && (
          <section className="retrieval-progress" aria-live="polite">
            <div className="retrieval-progress__pulse"><Search size={18} /></div>
            <div>
              <span>Building a permission-safe answer</span>
              <h2>{query}</h2>
              <ol>
                <li className="is-complete"><CheckCircle2 size={14} /> Interpreting scope</li>
                <li className="is-active"><span /> Checking current facts and conflicts</li>
                <li><span /> Verifying evidence and composing</li>
              </ol>
            </div>
          </section>
        )}

        {answer && level && LevelIcon && (
          <article className="answer-surface">
            <div className={`answer-trust answer-trust--${answer.level}`}>
              <LevelIcon size={16} />
              <strong>{level.label}</strong>
              <span>{Math.round(answer.confidence * 100)}%</span>
              <p>{level.description}</p>
            </div>

            <div className="answer-question">
              <span><Clock3 size={13} /> Current answer</span>
              <h2>{searchParams.get('q') || query}</h2>
            </div>

            <div className="answer-copy">{answer.answer}</div>

            {answer.level === 'abstain' && (
              <div className="answer-abstention">
                <AlertTriangle size={17} />
                <div>
                  <strong>No reliable answer was produced.</strong>
                  <span>Connect more sources, broaden the scope, or ask about a shorter time range.</span>
                </div>
              </div>
            )}

            <section className="answer-evidence" aria-labelledby="sources-heading">
              <div>
                <span>Verification</span>
                <h3 id="sources-heading">Sources used</h3>
              </div>
              {answer.citations.length === 0 ? (
                <div className="answer-no-sources">No visible citations were returned.</div>
              ) : (
                <div className="citation-grid">
                  {answer.citations.map((citation, index) => (
                    <button
                      type="button"
                      key={citation.id}
                      onClick={() => setSelectedCitation(citation)}
                      className={selectedCitation?.id === citation.id ? 'is-selected' : ''}
                    >
                      <span className="citation-number">{index + 1}</span>
                      <span>
                        <strong>{citation.title}</strong>
                        <small>
                          {citation.exact_text || 'Open to inspect source metadata and evidence.'}
                        </small>
                      </span>
                      <Quote size={15} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          </article>
        )}

        {error && (
          <div className="product-error" role="alert">
            <AlertTriangle size={17} />
            <div>
              <strong>AgentMesh could not answer</strong>
              <span>{error}</span>
            </div>
          </div>
        )}

        <form className="ask-composer" onSubmit={submit}>
          <div className="ask-scope">
            <label htmlFor="ask-scope">Scope</label>
            <input
              id="ask-scope"
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              placeholder="Project, team, account, or entity ID"
            />
            <span>Semantic scope picker is the next backend integration.</span>
          </div>
          <div className="ask-question-input">
            <label className="sr-only" htmlFor="ask-question">Question</label>
            <textarea
              id="ask-question"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ask a question about your company"
              rows={2}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void ask();
                }
              }}
            />
            <button type="submit" disabled={loading || !query.trim()} aria-label="Ask AgentMesh">
              <ArrowUp size={17} />
            </button>
          </div>
          <div className="ask-composer__note">
            <ShieldCheck size={13} /> Unknown source permissions fail closed.
          </div>
        </form>
      </main>

      {selectedCitation && (
        <EvidenceInspector
          citation={selectedCitation}
          index={Math.max(0, citationIndex)}
          onClose={() => setSelectedCitation(null)}
        />
      )}
    </div>
  );
}
