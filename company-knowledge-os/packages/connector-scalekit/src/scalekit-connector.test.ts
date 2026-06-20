import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { createHmac } from 'crypto';
import { EpisodeSchema } from '@company-knowledge-os/core';
import { ScaleKitConnector } from './scalekit-connector';

vi.mock('axios');

const creds = { clientId: 'c', clientSecret: 's', envUrl: 'https://env.scalekit.com', organizationId: 'org-1' };

describe('ScaleKitConnector', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('fetches an OAuth token then maps directory users to valid IEpisode shape', async () => {
    (axios.post as any).mockResolvedValue({ data: { access_token: 'tok', expires_in: 3600 } });
    (axios.get as any).mockResolvedValue({
      data: { users: [{ id: 'u1', email: 'a@b.com', created_at: new Date().toISOString() }] },
    });

    const connector = new ScaleKitConnector(creds);
    const episodes = await connector.fetchChanges(new Date(0));

    expect(episodes).toHaveLength(1);
    const parsed = EpisodeSchema.safeParse({
      ...episodes[0],
      tenant_id: '00000000-0000-0000-0000-000000000000',
      created_at: episodes[0].created_at.toISOString(),
      ingested_at: episodes[0].ingested_at.toISOString(),
    });
    expect(parsed.success).toBe(true);
    expect(episodes[0].source_system).toBe('scalekit');
  });

  it('validates webhook signatures via HMAC and rejects forged ones', () => {
    const connector = new ScaleKitConnector(creds, { enabled: true, webhook_secret: 'whsec' });
    const payload = JSON.stringify({ event_type: 'directory.user.updated' });
    const validSig = createHmac('sha256', 'whsec').update(payload).digest('hex');

    expect(connector.validateWebhookSignature(payload, validSig)).toBe(true);
    expect(connector.validateWebhookSignature(payload, 'forged')).toBe(false);
  });

  it('rejects webhook signatures when no secret is configured', () => {
    const connector = new ScaleKitConnector(creds);
    expect(connector.validateWebhookSignature('{}', 'anything')).toBe(false);
  });
});
