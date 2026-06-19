import { ArrowDown, Check, ChevronDown, Clock } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { eventBody, eventTitle, shortTime } from '../lib/format';
import type { MeshEvent, SessionMessage } from '../lib/types';
import { MessageCard } from './MessageCard';
import { ThinkingIndicator } from './ThinkingIndicator';
import { StatusBadge } from './StatusBadge';

type Props = {
  messages: SessionMessage[];
  events: MeshEvent[];
  workflowId?: string;
  running?: boolean;
  onApprove: (approved: boolean) => void;
};

export function Transcript({ messages, events, workflowId, running, onApprove }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showNewMessages, setShowNewMessages] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const prevMessageCount = useRef(messages.length);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    } else if (messages.length > prevMessageCount.current) {
      setShowNewMessages(true);
    }
    prevMessageCount.current = messages.length;
  }, [messages.length, autoScroll]);

  // Detect scroll position
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 80;
    setAutoScroll(atBottom);
    if (atBottom) setShowNewMessages(false);
  }, []);

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowNewMessages(false);
    setAutoScroll(true);
  }

  return (
    <div className="transcript" ref={scrollRef} onScroll={handleScroll}>
      {/* Rendered messages */}
      {messages.map((message) => (
        <MessageCard
          key={message.id}
          message={message}
          onApprove={message.role === 'approval' ? onApprove : undefined}
        />
      ))}

      {/* Live event step cards */}
      {events
        .slice()
        .reverse()
        .map((event) => {
          const needsApproval = event.eventType.includes('approval');
          return (
            <article
              key={event.id}
              className={`step-card ${needsApproval ? 'step-card--approval' : ''}`}
            >
              <div className="step-icon">
                {needsApproval ? <Clock size={17} /> : <Check size={17} />}
              </div>
              <div className="step-body">
                <div className="step-head">
                  <div>
                    <strong>{eventTitle(event)}</strong>
                    <span>
                      {event.agentId} · {shortTime(event.time)}
                    </span>
                  </div>
                  <ChevronDown size={16} />
                </div>
                <pre>{eventBody(event)}</pre>
                {needsApproval && (
                  <div className="approval-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={!workflowId}
                      onClick={() => onApprove(false)}
                    >
                      Reject
                    </button>
                    <button
                      className="primary-button"
                      type="button"
                      disabled={!workflowId}
                      onClick={() => onApprove(true)}
                    >
                      Approve
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}

      {/* Thinking indicator */}
      {running && (
        <ThinkingIndicator
          label={
            messages.some((m) => m.status === 'planning')
              ? 'Planning…'
              : messages.some((m) => m.status === 'executing')
                ? 'Executing…'
                : 'Thinking…'
          }
          startTime={messages.length ? messages[messages.length - 1].time : undefined}
        />
      )}

      {/* Scroll anchor */}
      <div ref={bottomRef} />

      {/* New messages pill */}
      {showNewMessages && (
        <button className="new-messages-pill" onClick={scrollToBottom}>
          <ArrowDown size={14} />
          New messages
        </button>
      )}
    </div>
  );
}
