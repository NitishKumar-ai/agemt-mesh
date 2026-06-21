import type { AskAnswer } from './types';

/**
 * Client-side chat session store (localStorage).
 *
 * The company-brain query endpoint (`/api/workflows/query`) is stateless and
 * single-shot, so conversational history lives on the client. The "New session"
 * chat page writes here on every turn; the "Session history" page reads it back.
 * Each assistant turn keeps the full `AskAnswer` so citations, confidence, and
 * abstention survive a reload and can be re-inspected from history.
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  answer?: AskAnswer;
  scope?: string;
  error?: boolean;
  /** True while tokens are still streaming in for this assistant turn. */
  streaming?: boolean;
  ts: number;
}

export interface ChatSession {
  id: string;
  title: string;
  scope: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

const STORAGE_KEY = 'agentmesh.chat.sessions';

function read(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(sessions: ChatSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    /* ignore quota / serialization failures */
  }
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** All sessions, most recently updated first. */
export function listSessions(): ChatSession[] {
  return read().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSession(id: string): ChatSession | undefined {
  return read().find((session) => session.id === id);
}

/** Build a fresh in-memory session. Not persisted until {@link saveSession}. */
export function createSession(init?: Partial<ChatSession>): ChatSession {
  const now = Date.now();
  return {
    id: init?.id ?? uid(),
    title: init?.title ?? 'New conversation',
    scope: init?.scope ?? '',
    createdAt: init?.createdAt ?? now,
    updatedAt: now,
    messages: init?.messages ?? [],
  };
}

/** Upsert a session, stamping `updatedAt`. */
export function saveSession(session: ChatSession): ChatSession {
  const sessions = read();
  const next = { ...session, updatedAt: Date.now() };
  const idx = sessions.findIndex((existing) => existing.id === session.id);
  if (idx >= 0) sessions[idx] = next;
  else sessions.push(next);
  write(sessions);
  return next;
}

export function deleteSession(id: string): void {
  write(read().filter((session) => session.id !== id));
}

export function clearSessions(): void {
  write([]);
}

/** Title from the first user message, trimmed for the history list. */
export function deriveTitle(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) return 'New conversation';
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}

/** Compact "2m ago" / "3h ago" / date for the history list. */
export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
}
