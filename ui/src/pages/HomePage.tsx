import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  BookOpenCheck,
  CalendarRange,
  CheckCircle2,
  CircleAlert,
  MessagesSquare,
  Plus,
  Quote,
  ShieldCheck,
  Sparkles,
  Square,
  Users,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { EvidenceInspector } from '../components/EvidenceInspector';
import { ConnectionsRail } from '../components/ConnectionsRail';
import { api } from '../lib/api';
import type { AskAnswer, Citation } from '../lib/types';
import {
  createSession,
  deriveTitle,
  getSession,
  saveSession,
  uid,
  type ChatMessage,
  type ChatSession,
} from '../lib/chatSessions';
import {
  loadDemoIdentities,
  setActiveIdentity,
  getActiveIdentityKey,
  type DemoIdentity,
} from '../lib/demoIdentity';

const LEVEL_META: Record<
  AskAnswer['level'],
  { label: string; color: string; icon: typeof CheckCircle2 }
> = {
  high: { label: 'High confidence', color: 'var(--success)', icon: CheckCircle2 },
  medium: { label: 'Medium confidence', color: 'var(--brand-teal)', icon: ShieldCheck },
  low: { label: 'Low confidence', color: 'var(--brand-ochre)', icon: AlertTriangle },
  abstain: { label: 'Abstained', color: 'var(--error)', icon: AlertTriangle },
};

const quickStarts = [
  { title: 'Weekly digest', icon: CalendarRange, prompt: 'What changed across the company this week?' },
  { title: 'Meeting prep', icon: MessagesSquare, prompt: 'Prepare me for my next meeting.' },
  { title: 'Onboarding brief', icon: Users, prompt: 'Create an onboarding brief for a new team member.' },
  { title: 'Incident brief', icon: CircleAlert, prompt: 'Summarize the latest incident and its open follow-ups.' },
  { title: 'Account summary', icon: BookOpenCheck, prompt: 'Summarize the current state of a customer account.' },
];

// Growth Memory: the seeded Atlas AI campaign scope and its hero questions. Each
// quickstart scopes the question to the campaign so the permission-aware funnel +
// superseded-report answer comes back immediately.
const GROWTH_SCOPE = 'campaign-founder-productivity';
const growthQuickStarts = [
  { title: 'Founder growth brief', icon: Sparkles, prompt: 'How did the Founder Productivity Campaign perform, and what should we do next?' },
  { title: 'Which channel worked?', icon: CalendarRange, prompt: 'Which channel brought the highest-quality paying users for this campaign?' },
  { title: "What's now outdated?", icon: CircleAlert, prompt: 'Which earlier report or assumption about this campaign is now outdated?' },
];

/**
 * "New session" — a working multi-turn chat over the company brain. Each turn is
 * grounded by `/api/workflows/query`, cited, and permission-aware. The whole
 * conversation is persisted via the chatSessions store so it shows up under
 * "History" (the Ask page) and can be reopened with `?session=<id>`.
 */
export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [session, setSession] = useState<ChatSession>(() => createSession());
  const [scope, setScope] = useState('');
  const [input, setInput] = useState(searchParams.get('q') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [identities, setIdentities] = useState<DemoIdentity[]>([]);
  const [activeIdentityKey, setActiveIdentityKey] = useState<string | null>(getActiveIdentityKey());

  // Load demo identities for the permission-aware "View as" switcher. Selecting
  // one sets the Bearer token the api client injects, so the same question
  // returns evidence scoped to that identity.
  useEffect(() => {
    loadDemoIdentities()
      .then((list) => {
        setIdentities(list);
        setActiveIdentityKey(getActiveIdentityKey());
      })
      .catch(() => setIdentities([]));
  }, []);

  function switchIdentity(identity: DemoIdentity) {
    setActiveIdentity(identity);
    setActiveIdentityKey(identity.key);
  }

  // Resume a session from `?session=<id>` if present; otherwise keep the fresh one.
  const sessionParam = searchParams.get('session');
  useEffect(() => {
    if (!sessionParam) return;
    const existing = getSession(sessionParam);
    if (existing) {
      setSession(existing);
      setScope(existing.scope || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionParam]);

  // Keep the transcript pinned to the latest message.
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session.messages, loading]);

  // Growth Memory: scope to the seeded campaign, then ask, so the funnel +
  // superseded-report answer is grounded without manual scope entry.
  function runGrowthBrief(prompt: string) {
    setScope(GROWTH_SCOPE);
    void send(prompt, GROWTH_SCOPE);
  }

  function startNewSession() {
    setSession(createSession({ scope }));
    setInput('');
    setError(null);
    setSelectedCitation(null);
    const next = new URLSearchParams(searchParams);
    next.delete('session');
    next.delete('q');
    setSearchParams(next, { replace: true });
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function send(text = input, scopeOverride?: string) {
    const question = text.trim();
    if (!question || loading) return;
    const cleanScope = (scopeOverride ?? scope).trim();
    setError(null);
    setInput('');

    const userMessage: ChatMessage = {
      id: uid(),
      role: 'user',
      text: question,
      scope: cleanScope,
      ts: Date.now(),
    };

    const assistantId = uid();
    const streamingMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      text: '',
      scope: cleanScope,
      streaming: true,
      ts: Date.now(),
    };

    const isFirst = session.messages.length === 0;
    let working: ChatSession = {
      ...session,
      title: isFirst ? deriveTitle(question) : session.title,
      scope: cleanScope,
      messages: [...session.messages, userMessage],
    };
    // Persist the user turn now; the assistant turn is persisted once complete.
    working = saveSession(working);
    setSession({ ...working, messages: [...working.messages, streamingMessage] });

    // Reflect the (now persisted) session in the URL so a reload resumes it.
    if (sessionParam !== working.id) {
      const next = new URLSearchParams(searchParams);
      next.set('session', working.id);
      next.delete('q');
      setSearchParams(next, { replace: true });
    }

    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;

    let acc = '';
    let citations: Citation[] = [];
    let settled = false;

    // Patch the in-flight assistant message in place as tokens arrive.
    const patchAssistant = (patch: Partial<ChatMessage>) => {
      setSession((prev) => ({
        ...prev,
        messages: prev.messages.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)),
      }));
    };

    // Replace the streaming placeholder with a finished assistant turn + persist.
    const finalize = (message: ChatMessage) => {
      settled = true;
      setSession(saveSession({ ...working, messages: [...working.messages, message] }));
    };

    try {
      await api.askQuestionStream(
        question,
        cleanScope,
        {
          onMeta: (cites) => {
            citations = cites;
            // Surface sources while the prose is still streaming.
            patchAssistant({ answer: { answer: '', confidence: 0, level: 'low', citations: cites } });
          },
          onToken: (chunk) => {
            acc += chunk;
            patchAssistant({ text: acc });
          },
          onDone: (answer) => {
            acc = answer.answer || acc;
            citations = answer.citations;
            finalize({
              id: assistantId,
              role: 'assistant',
              text: acc,
              answer,
              scope: cleanScope,
              streaming: false,
              ts: Date.now(),
            });
          },
          onError: (message) => {
            throw new Error(message);
          },
        },
        controller.signal,
      );
    } catch (cause) {
      if (controller.signal.aborted) {
        // User pressed Stop: keep whatever streamed so far as a finished turn.
        finalize({
          id: assistantId,
          role: 'assistant',
          text: acc || 'Stopped before an answer was generated.',
          answer: acc ? { answer: acc, confidence: 0, level: 'low', citations } : undefined,
          scope: cleanScope,
          streaming: false,
          ts: Date.now(),
        });
      } else {
        const message = cause instanceof Error ? cause.message : 'AgentMesh could not complete the query.';
        finalize({
          id: assistantId,
          role: 'assistant',
          text: message,
          error: true,
          streaming: false,
          ts: Date.now(),
        });
        setError(message);
      }
    } finally {
      // Safety net: if the stream ended without a terminal frame, settle the
      // partial so we never leave a placeholder stuck in the streaming state.
      if (!settled) {
        finalize({
          id: assistantId,
          role: 'assistant',
          text: acc || 'No answer was returned.',
          answer: acc ? { answer: acc, confidence: 0, level: 'low', citations } : undefined,
          scope: cleanScope,
          streaming: false,
          ts: Date.now(),
        });
      }
      setLoading(false);
      abortRef.current = null;
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send();
  }

  const hasMessages = session.messages.length > 0;
  const selectedCitationIndex = useMemo(() => {
    for (const message of session.messages) {
      const idx = message.answer?.citations.findIndex((c) => c.id === selectedCitation?.id) ?? -1;
      if (idx >= 0) return idx;
    }
    return 0;
  }, [session.messages, selectedCitation]);

  const composer = (
    <form className="chat-composer" onSubmit={submit}>
      <div className="chat-composer__input">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about a project, decision, customer, or incident…"
          rows={1}
          aria-label="Ask your company brain"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        {loading ? (
          <button
            type="button"
            className="chat-composer__stop"
            onClick={stop}
            aria-label="Stop generating"
            title="Stop generating"
          >
            <Square size={14} />
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()} aria-label="Send">
            <ArrowUp size={17} />
          </button>
        )}
      </div>
      <div className="chat-composer__controls">
        <div className="chat-composer__scope">
          <label htmlFor="chat-scope">Scope <span>optional</span></label>
          <input
            id="chat-scope"
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            placeholder="Project, team, account, or entity ID"
          />
        </div>
        <div className="chat-composer__note">
          <ShieldCheck size={13} /> Permission-aware and cited
        </div>
      </div>
    </form>
  );

  return (
    <div className={`chat-workspace ${selectedCitation ? 'chat-workspace--evidence-open' : ''}`}>
      <div className="chat-layout">
        <main className={`chat-main ${hasMessages ? '' : 'chat-main--empty'}`}>
          <header className="chat-head">
            <div>
              <span className="chat-head__eyebrow"><Sparkles size={13} /> New session</span>
              <h1>Ask your company brain</h1>
              <p>Get a current answer with the evidence and access rules attached.</p>
            </div>
            {hasMessages && (
              <button type="button" className="chat-new" onClick={startNewSession}>
                <Plus size={15} /> New chat
              </button>
            )}
          </header>

          {identities.length > 0 && (
            <div className="identity-switcher" role="group" aria-label="View as identity">
              <span className="identity-switcher__label"><Users size={13} /> View as</span>
              <div className="identity-switcher__options">
                {identities.map((identity) => (
                  <button
                    type="button"
                    key={identity.key}
                    className={`identity-chip ${activeIdentityKey === identity.key ? 'is-active' : ''}`}
                    onClick={() => switchIdentity(identity)}
                    title={identity.description}
                  >
                    <strong>{identity.name}</strong>
                    <small>{identity.role}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!hasMessages && composer}

          <div className="chat-transcript" ref={transcriptRef}>
            {!hasMessages && !loading && (
              <section className="chat-empty">
                <div className="chat-starters">
                  <div className="chat-starters__heading">
                    <span>Common questions</span>
                    <p>Start with a useful brief, then refine it in conversation.</p>
                  </div>
                  <div className="chat-quickstarts">
                    {quickStarts.map(({ title, icon: Icon, prompt }) => (
                      <button type="button" key={title} onClick={() => void send(prompt)}>
                        <span className="chat-quickstarts__icon"><Icon size={17} /></span>
                        <strong>{title}</strong>
                        <span>Ask now</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="chat-starters chat-starters--growth">
                  <div className="chat-starters__heading">
                    <span>Atlas AI campaign</span>
                    <p>Explore the seeded growth memory with campaign scope applied.</p>
                  </div>
                  <div className="chat-growth-actions">
                    {growthQuickStarts.map(({ title, icon: Icon, prompt }) => (
                      <button type="button" key={title} onClick={() => runGrowthBrief(prompt)}>
                        <Icon size={16} />
                        <strong>{title}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {session.messages.map((message) =>
              message.role === 'user' ? (
                <div key={message.id} className="bubble bubble--user">
                  <div className="bubble__body">{message.text}</div>
                </div>
              ) : (
                <AssistantBubble
                  key={message.id}
                  message={message}
                  selectedCitationId={selectedCitation?.id ?? null}
                  onSelectCitation={setSelectedCitation}
                />
              ),
            )}
          </div>

          {error && (
            <div className="chat-error" role="alert">
              <AlertTriangle size={15} /> {error}
            </div>
          )}

          {hasMessages && composer}
        </main>

        <ConnectionsRail />
      </div>

      {selectedCitation && (
        <EvidenceInspector
          citation={selectedCitation}
          index={Math.max(0, selectedCitationIndex)}
          onClose={() => setSelectedCitation(null)}
        />
      )}

      <style>{`
        .chat-workspace {
          width: 100%;
          min-height: 100%;
          padding: 24px 28px 28px;
          box-sizing: border-box;
        }
        .chat-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 280px;
          gap: 24px;
          align-items: start;
          max-width: 1280px;
          margin: 0 auto;
          width: 100%;
          height: 100%;
        }
        .chat-main {
          display: flex;
          flex-direction: column;
          gap: 16px;
          min-width: 0;
          min-height: 0;
        }
        .chat-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }
        .chat-head__eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--muted);
        }
        .chat-head__eyebrow svg { color: var(--brand-purple); }
        .chat-head h1 {
          margin: 6px 0 0;
          font-size: clamp(27px, 3vw, 34px);
          letter-spacing: -0.8px;
          line-height: 1.12;
          text-wrap: balance;
        }
        .chat-head p {
          max-width: 620px;
          margin: 8px 0 0;
          color: var(--muted);
          font-size: 14px;
          line-height: 1.5;
        }
        .chat-new {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 12px;
          border: 1px solid var(--hairline);
          background: var(--surface-card);
          color: var(--ink);
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          transition: border-color 0.15s ease, transform 0.15s ease;
          white-space: nowrap;
        }
        .chat-new:hover {
          border-color: color-mix(in srgb, var(--brand-purple) 45%, var(--hairline));
          transform: translateY(-1px);
        }
        .chat-transcript {
          flex: 1;
          min-height: 320px;
          max-height: calc(100vh - 360px);
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 4px 2px;
        }
        .chat-main--empty .chat-transcript {
          min-height: 0;
          max-height: none;
          overflow: visible;
        }
        .chat-empty {
          display: grid;
          grid-template-columns: minmax(0, 1.35fr) minmax(240px, 0.8fr);
          gap: 16px;
          padding: 4px 0 0;
        }
        .chat-starters {
          min-width: 0;
        }
        .chat-starters__heading {
          margin-bottom: 12px;
        }
        .chat-starters__heading > span {
          color: var(--ink);
          font-size: 13px;
          font-weight: 700;
        }
        .chat-starters__heading p {
          margin: 3px 0 0;
          color: var(--muted);
          font-size: 12.5px;
          line-height: 1.45;
        }
        .chat-starters--growth {
          padding: 16px;
          border: 1px solid color-mix(in srgb, var(--brand-teal) 24%, var(--hairline));
          border-radius: 14px;
          background: color-mix(in srgb, var(--brand-teal) 5%, var(--surface-card));
        }
        .chat-quickstarts {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .chat-quickstarts button {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 8px;
          min-height: 50px;
          padding: 10px 12px;
          border: 1px solid var(--hairline);
          border-radius: 10px;
          background: var(--surface-card);
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          color: var(--ink);
          text-align: left;
          transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
        }
        .chat-quickstarts button:hover {
          border-color: color-mix(in srgb, var(--brand-purple) 45%, var(--hairline));
          background: var(--canvas);
          transform: translateY(-1px);
        }
        .chat-quickstarts__icon { display: inline-flex; color: var(--brand-purple); }
        .chat-quickstarts button > span:last-child {
          color: var(--muted);
          font-size: 11px;
          font-weight: 600;
        }
        .chat-growth-actions {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .chat-growth-actions button {
          display: flex;
          align-items: center;
          gap: 9px;
          min-height: 42px;
          padding: 8px 10px;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: var(--ink);
          cursor: pointer;
          text-align: left;
          transition: background 0.15s ease;
        }
        .chat-growth-actions button:hover {
          background: color-mix(in srgb, var(--brand-teal) 10%, transparent);
        }
        .chat-growth-actions svg {
          flex-shrink: 0;
          color: var(--brand-teal);
        }
        .chat-growth-actions strong {
          font-size: 12.5px;
          line-height: 1.35;
        }
        .bubble { display: flex; max-width: 100%; }
        .bubble--user { justify-content: flex-end; }
        .bubble--user .bubble__body {
          max-width: 78%;
          padding: 12px 16px;
          border-radius: 16px 16px 4px 16px;
          background: linear-gradient(135deg, var(--brand-purple), var(--brand-blue, var(--brand-purple)));
          color: #fff;
          font-size: 14px;
          line-height: 1.5;
          white-space: pre-wrap;
        }
        .bubble--assistant { flex-direction: column; gap: 8px; }
        .chat-error {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: var(--error);
          background: color-mix(in srgb, var(--error) 8%, transparent);
          border: 1px solid color-mix(in srgb, var(--error) 25%, transparent);
          padding: 8px 12px;
          border-radius: 12px;
        }
        .bubble__thinking {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 12px 16px;
          border-radius: 16px;
          border: 1px solid var(--hairline);
          background: var(--surface-card);
          font-size: 13px;
          color: var(--muted);
        }
        .bubble__thinking span {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--brand-purple);
          animation: chatPulse 1.1s infinite ease-in-out;
        }
        .bubble__thinking span:nth-child(2) { animation-delay: 0.15s; }
        .bubble__thinking span:nth-child(3) { animation-delay: 0.3s; }
        .bubble__thinking em { margin-left: 6px; font-style: normal; }
        @keyframes chatPulse {
          0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
        .answer-card {
          border: 1px solid var(--hairline);
          border-radius: 16px;
          background: var(--surface-card);
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          max-width: 88%;
        }
        .answer-card__trust {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 700;
        }
        .answer-card__trust .pct {
          margin-left: 2px;
          font-variant-numeric: tabular-nums;
          opacity: 0.8;
        }
        .answer-card__body { font-size: 14px; line-height: 1.6; color: var(--ink); white-space: pre-wrap; }
        .answer-card__caret {
          display: inline-block;
          width: 7px;
          height: 1.05em;
          margin-left: 2px;
          vertical-align: text-bottom;
          border-radius: 1px;
          background: var(--brand-purple);
          animation: chatCaret 1s steps(2, start) infinite;
        }
        @keyframes chatCaret { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .answer-card__pending {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: var(--muted);
        }
        .answer-card__pending span {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--brand-purple);
          animation: chatPulse 1.1s infinite ease-in-out;
        }
        .answer-card__pending span:nth-child(2) { animation-delay: 0.15s; }
        .answer-card__pending span:nth-child(3) { animation-delay: 0.3s; }
        .answer-card__pending em { margin-left: 6px; font-style: normal; }
        .answer-card__abstain {
          display: flex;
          gap: 8px;
          font-size: 12.5px;
          color: var(--muted);
          background: color-mix(in srgb, var(--error) 7%, transparent);
          border: 1px solid color-mix(in srgb, var(--error) 20%, transparent);
          border-radius: 12px;
          padding: 9px 11px;
        }
        .answer-card__cites { display: flex; flex-direction: column; gap: 6px; }
        .answer-card__cites > span {
          font-size: 11px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.04em; color: var(--muted);
        }
        .answer-card__cite {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          text-align: left;
          padding: 8px 10px;
          border: 1px solid var(--hairline);
          border-radius: 10px;
          background: var(--canvas);
          cursor: pointer;
          transition: border-color 0.15s ease;
        }
        .answer-card__cite:hover,
        .answer-card__cite.is-selected {
          border-color: color-mix(in srgb, var(--brand-purple) 50%, var(--hairline));
        }
        .answer-card__cite .num {
          flex-shrink: 0;
          width: 20px; height: 20px;
          border-radius: 6px;
          display: grid; place-items: center;
          font-size: 11px; font-weight: 700;
          background: color-mix(in srgb, var(--brand-purple) 14%, transparent);
          color: var(--brand-purple);
        }
        .answer-card__cite .meta { min-width: 0; flex: 1; display: flex; flex-direction: column; }
        .answer-card__cite .meta strong {
          font-size: 13px; color: var(--ink);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .answer-card__cite .meta small {
          font-size: 11.5px; color: var(--muted);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .answer-card__cite svg { color: var(--muted); flex-shrink: 0; }
        .chat-composer {
          display: flex;
          flex-direction: column;
          gap: 12px;
          border: 1px solid var(--hairline);
          border-radius: 14px;
          background: var(--surface-card);
          padding: 14px;
          box-shadow: 0 10px 28px rgb(24 23 21 / 5%);
          transition: border-color 0.16s ease, box-shadow 0.16s ease;
        }
        .chat-composer:focus-within {
          border-color: color-mix(in srgb, var(--pm-brand) 55%, var(--hairline));
          box-shadow: 0 12px 32px rgb(24 23 21 / 8%);
        }
        .chat-composer__controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding-top: 10px;
          border-top: 1px solid var(--hairline);
        }
        .chat-composer__scope {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          flex: 1;
        }
        .chat-composer__scope label {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--muted);
          white-space: nowrap;
        }
        .chat-composer__scope label span {
          margin-left: 3px;
          font-weight: 500;
          letter-spacing: 0;
          text-transform: none;
        }
        .chat-composer__scope input {
          flex: 1;
          min-width: 120px;
          border: 0;
          background: transparent;
          color: var(--ink);
          padding: 4px 0;
          font-size: 12.5px;
          outline: none;
        }
        .chat-composer__input {
          display: flex;
          align-items: flex-end;
          gap: 10px;
        }
        .chat-composer__input textarea {
          flex: 1;
          resize: none;
          border: none;
          background: transparent;
          color: var(--ink);
          font-size: 14.5px;
          line-height: 1.5;
          min-height: 42px;
          padding: 9px 2px;
          max-height: 160px;
          outline: none;
          font-family: inherit;
        }
        .chat-composer__input button {
          flex-shrink: 0;
          width: 38px; height: 38px;
          border-radius: 9px;
          border: none;
          display: grid; place-items: center;
          background: var(--pm-brand);
          color: #fff;
          cursor: pointer;
          transition: opacity 0.15s ease;
        }
        .chat-composer__input button:disabled { opacity: 0.4; cursor: not-allowed; }
        .chat-composer__stop {
          flex-shrink: 0;
          width: 38px; height: 38px;
          border-radius: 9px;
          border: 1px solid var(--hairline);
          display: grid; place-items: center;
          background: var(--surface-card);
          color: var(--ink);
          cursor: pointer;
          transition: border-color 0.15s ease, color 0.15s ease;
        }
        .chat-composer__stop:hover {
          border-color: color-mix(in srgb, var(--error) 45%, var(--hairline));
          color: var(--error);
        }
        .chat-composer__note {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          color: var(--muted);
          white-space: nowrap;
        }
        .chat-composer__note svg { color: var(--brand-teal); }
        @media (max-width: 1080px) {
          .chat-layout { grid-template-columns: minmax(0, 1fr); }
          .chat-layout .connections-rail { display: none; }
          .chat-transcript { max-height: none; }
        }
        @media (max-width: 820px) {
          .chat-empty {
            grid-template-columns: minmax(0, 1fr);
          }
          .chat-starters--growth {
            padding: 14px;
          }
          .chat-growth-actions {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        @media (max-width: 680px) {
          .chat-workspace {
            padding: 18px 16px 20px;
          }
          .chat-head {
            align-items: center;
          }
          .chat-head h1 {
            font-size: 23px;
          }
          .chat-head p {
            font-size: 13px;
          }
          .chat-quickstarts {
            display: grid;
            grid-template-columns: 1fr;
            width: 100%;
          }
          .chat-quickstarts button {
            min-height: 44px;
          }
          .chat-growth-actions {
            grid-template-columns: 1fr;
          }
          .chat-composer {
            padding: 12px;
          }
          .chat-composer__controls {
            align-items: flex-start;
            flex-direction: column;
            gap: 8px;
          }
          .chat-composer__scope {
            align-items: center;
            flex-direction: row;
            gap: 6px;
            width: 100%;
          }
          .chat-composer__scope input {
            box-sizing: border-box;
            width: 100%;
          }
          .chat-composer__note {
            align-items: flex-start;
            line-height: 1.4;
            white-space: normal;
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Detects generic LLM-assistant refusals that leak through when the company
 * brain has no permitted evidence (e.g. "I'm unable to access Slack…"). These
 * read as ChatGPT, not as a grounded company brain, so we swap them for a clean
 * abstention. Kept deliberately broad — false positives only mean a tidier
 * abstain message, never a wrong factual answer.
 */
function isRefusal(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return (
    /^(i'm|i am)\s+(sorry|unable|not able|afraid)/.test(t) ||
    /^i\s+(can('|no)?t|cannot|do not|don't)\b/.test(t) ||
    /\b(unable|don't have access|do not have access|can't access|cannot access|not able to access)\b.*\b(slack|gmail|email|messages?|account|personal|your)\b/.test(t) ||
    /\bas an ai\b/.test(t) ||
    /\bi don't have (the )?ability\b/.test(t)
  );
}

function AssistantBubble({
  message,
  selectedCitationId,
  onSelectCitation,
}: {
  message: ChatMessage;
  selectedCitationId: string | null;
  onSelectCitation: (citation: Citation) => void;
}) {
  if (message.error) {
    return (
      <div className="bubble bubble--assistant">
        <div className="answer-card" style={{ borderColor: 'color-mix(in srgb, var(--error) 30%, var(--hairline))' }}>
          <div className="answer-card__trust" style={{ color: 'var(--error)' }}>
            <AlertTriangle size={15} /> Could not answer
          </div>
          <div className="answer-card__body">{message.text}</div>
        </div>
      </div>
    );
  }

  const answer = message.answer;
  const streaming = message.streaming;
  const meta = answer ? LEVEL_META[answer.level] : null;
  // A generic model refusal ("I'm unable to access Slack…") must never reach the
  // user — it breaks the company-brain illusion. Replace it with a clean,
  // on-brand abstention. A *real* abstain (e.g. conflicting sources) keeps its
  // own explanation, so only override when the text actually looks like a
  // refusal. Skip while streaming: the partial text isn't final yet.
  const refusal = !streaming && isRefusal(message.text);
  const abstaining = !streaming && (refusal || answer?.level === 'abstain');
  const Icon = abstaining ? AlertTriangle : meta?.icon ?? CheckCircle2;

  return (
    <div className="bubble bubble--assistant">
      <div className="answer-card">
        {/* Trust badge only once the answer is final — confidence isn't known mid-stream. */}
        {!streaming && answer && meta && (
          <div
            className="answer-card__trust"
            style={{ color: abstaining ? 'var(--error)' : meta.color }}
          >
            <Icon size={15} /> {abstaining ? 'Abstained' : meta.label}
            {!abstaining && <span className="pct">{Math.round(answer.confidence * 100)}%</span>}
          </div>
        )}

        {streaming && message.text.length === 0 ? (
          // Waiting on the first token: show the thinking indicator inline.
          <div className="answer-card__pending">
            <span /><span /><span />
            <em>Building a permission-safe, cited answer…</em>
          </div>
        ) : abstaining ? (
          // On abstain the model prose is ungrounded (a refusal or generic
          // advice), so never show it — render a clean, on-brand abstention.
          // Conflicting sources get different wording than missing evidence.
          <div className="answer-card__abstain">
            <AlertTriangle size={15} />
            <span>
              {(answer?.citations.length ?? 0) > 0 ? (
                <>I can see evidence on this, but the sources disagree — so I won't guess. The conflicting evidence is below.</>
              ) : (
                <>I don't have enough permitted evidence to answer that confidently. Add a scope (for example <code>project-atlas</code>) or connect more sources, and I'll ground the answer in cited evidence.</>
              )}
            </span>
          </div>
        ) : (
          <div className="answer-card__body">
            {message.text}
            {streaming && <span className="answer-card__caret" aria-hidden="true" />}
          </div>
        )}

        {answer && answer.citations.length > 0 && (
          <div className="answer-card__cites">
            <span>Sources used</span>
            {answer.citations.map((citation, index) => (
              <button
                type="button"
                key={citation.id}
                className={`answer-card__cite ${selectedCitationId === citation.id ? 'is-selected' : ''}`}
                onClick={() => onSelectCitation(citation)}
              >
                <span className="num">{index + 1}</span>
                <span className="meta">
                  <strong>{citation.title}</strong>
                  <small>{citation.exact_text || 'Open to inspect source metadata and evidence.'}</small>
                </span>
                <Quote size={14} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
