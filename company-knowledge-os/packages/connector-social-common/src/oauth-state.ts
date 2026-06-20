import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'crypto';

export interface OAuthStateEntry {
  platform: string;
  codeVerifier?: string;
  createdAt: number;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Server-side store for OAuth `state` nonces (and, where applicable, the PKCE
 * code_verifier tied to that nonce). Replaces hardcoded per-platform state
 * literals (e.g. "mesh_oauth_instagram") which let an attacker forge a
 * callback and link their account to a victim's session (login CSRF), and
 * fixes the Twitter flow where a PKCE verifier was generated and then
 * discarded instead of being persisted for the token exchange.
 *
 * Each state is single-use: `consume()` validates and deletes it atomically
 * so a captured callback URL cannot be replayed.
 */
export class OAuthStateStore {
  private entries = new Map<string, OAuthStateEntry>();

  constructor(private ttlMs: number = DEFAULT_TTL_MS) {}

  /** Generate a fresh random state for the given platform and remember it. */
  create(platform: string, codeVerifier?: string): string {
    this.sweep();
    const state = randomUUID();
    this.entries.set(state, { platform, codeVerifier, createdAt: Date.now() });
    return state;
  }

  /**
   * Validate and consume a state value returned on the OAuth callback.
   * Returns the stored entry on success, or null if the state is missing,
   * expired, or doesn't match the expected platform.
   */
  consume(state: string, expectedPlatform: string): OAuthStateEntry | null {
    const entry = this.entries.get(state);
    if (!entry) return null;
    this.entries.delete(state);

    if (Date.now() - entry.createdAt > this.ttlMs) return null;
    if (!timingSafeEqualStrings(entry.platform, expectedPlatform)) return null;

    return entry;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [state, entry] of this.entries) {
      if (now - entry.createdAt > this.ttlMs) this.entries.delete(state);
    }
  }
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export interface PkceChallenge {
  codeVerifier: string;
  codeChallenge: string;
}

/** Generate an RFC 7636 PKCE code_verifier/code_challenge pair (S256). */
export function generatePkce(): PkceChallenge {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}
