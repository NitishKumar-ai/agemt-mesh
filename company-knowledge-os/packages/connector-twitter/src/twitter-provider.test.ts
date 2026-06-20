import { describe, it, expect } from 'vitest';
import { generatePkce } from '@company-knowledge-os/connector-social-common';
import { TwitterProvider } from './twitter-provider';

describe('TwitterProvider PKCE auth url', () => {
  it('requires a real code_challenge instead of reusing state as challenge', () => {
    const provider = new TwitterProvider({ clientId: 'client-123' });
    expect(() => provider.getAuthUrl('https://app/cb', 'some-state')).toThrow();
  });

  it('builds an S256 challenge URL distinct from the verifier (fixes the old "plain"/state-as-challenge bug)', () => {
    const provider = new TwitterProvider({ clientId: 'client-123' });
    const { codeVerifier, codeChallenge } = generatePkce();
    const url = provider.getAuthUrl('https://app/cb', 'some-state', codeChallenge);

    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain(encodeURIComponent(codeChallenge));
    expect(url).not.toContain(codeVerifier);
  });

  it('rejects token exchange without the persisted code_verifier', async () => {
    const provider = new TwitterProvider({ clientId: 'client-123' });
    await expect(provider.exchangeCode('auth-code', 'https://app/cb')).rejects.toThrow();
  });
});
