import { describe, it, expect, vi } from 'vitest';
import { OAuthStateStore, generatePkce } from './oauth-state';

describe('OAuthStateStore', () => {
  it('generates unique state nonces, not hardcoded literals', () => {
    const store = new OAuthStateStore();
    const states = new Set([
      store.create('twitter'),
      store.create('twitter'),
      store.create('instagram'),
    ]);
    expect(states.size).toBe(3);
  });

  it('consumes a valid state and returns its entry', () => {
    const store = new OAuthStateStore();
    const state = store.create('linkedin', 'verifier-123');
    const entry = store.consume(state, 'linkedin');
    expect(entry).not.toBeNull();
    expect(entry?.codeVerifier).toBe('verifier-123');
  });

  it('rejects an unknown state (forged callback)', () => {
    const store = new OAuthStateStore();
    expect(store.consume('not-a-real-state', 'twitter')).toBeNull();
  });

  it('rejects state reuse (replay of a captured callback URL)', () => {
    const store = new OAuthStateStore();
    const state = store.create('facebook');
    expect(store.consume(state, 'facebook')).not.toBeNull();
    expect(store.consume(state, 'facebook')).toBeNull();
  });

  it('rejects a state issued for a different platform', () => {
    const store = new OAuthStateStore();
    const state = store.create('youtube');
    expect(store.consume(state, 'tiktok')).toBeNull();
  });

  it('rejects an expired state', () => {
    vi.useFakeTimers();
    const store = new OAuthStateStore(1000);
    const state = store.create('threads');
    vi.advanceTimersByTime(2000);
    expect(store.consume(state, 'threads')).toBeNull();
    vi.useRealTimers();
  });
});

describe('generatePkce', () => {
  it('produces a verifier/challenge pair where challenge is derived, not the verifier itself', () => {
    const { codeVerifier, codeChallenge } = generatePkce();
    expect(codeVerifier).not.toBe(codeChallenge);
    expect(codeVerifier.length).toBeGreaterThan(20);
    expect(codeChallenge.length).toBeGreaterThan(20);
  });

  it('produces distinct verifiers on each call', () => {
    const a = generatePkce();
    const b = generatePkce();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });
});
