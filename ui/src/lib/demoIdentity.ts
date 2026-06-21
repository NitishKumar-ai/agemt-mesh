/**
 * Demo identity store for the permission-aware "View as" switcher.
 *
 * Tokens are fetched fresh from the server (re-signed each boot, so we never
 * persist the token itself — only the selected identity key). The active token
 * is injected as a Bearer header by the API client (`lib/api.ts`) so the
 * permission-aware backend returns results scoped to the chosen identity.
 */
export interface DemoIdentity {
  key: string;
  name: string;
  role: string;
  description: string;
  token: string;
}

const STORAGE_KEY = 'agentmesh.demo.identity';

let authToken: string | null = null;
let activeKey: string | null = null;
const listeners = new Set<() => void>();

export function getAuthToken(): string | null {
  return authToken;
}

export function getActiveIdentityKey(): string | null {
  return activeKey;
}

export function setActiveIdentity(identity: DemoIdentity): void {
  authToken = identity.token;
  activeKey = identity.key;
  try {
    localStorage.setItem(STORAGE_KEY, identity.key);
  } catch {
    /* ignore storage failures */
  }
  listeners.forEach((listener) => listener());
}

export function subscribeIdentity(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Fetch the demo identities and select a default (persisted key, else first). */
export async function loadDemoIdentities(): Promise<DemoIdentity[]> {
  const response = await fetch('/api/demo/identities', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Demo identities are unavailable.');
  const body = (await response.json()) as { identities: DemoIdentity[] };
  const identities = body.identities ?? [];
  if (identities.length > 0) {
    let preferred: DemoIdentity | undefined;
    try {
      const savedKey = localStorage.getItem(STORAGE_KEY);
      preferred = identities.find((identity) => identity.key === savedKey);
    } catch {
      preferred = undefined;
    }
    setActiveIdentity(preferred ?? identities[0]);
  }
  return identities;
}
