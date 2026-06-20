import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { EpisodeSchema } from '@company-knowledge-os/core';
import { TwitterConnector } from './twitter-connector';

vi.mock('axios');

describe('TwitterConnector.fetchChanges', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('maps tweets to valid IEpisode shape', async () => {
    (axios.get as any).mockResolvedValue({
      data: { data: [{ id: '1', author_id: 'u1', created_at: new Date().toISOString(), text: 'hi' }] },
    });

    const connector = new TwitterConnector({ clientId: 'x' }, 'token', 'u1');
    const episodes = await connector.fetchChanges(new Date(0));

    expect(episodes).toHaveLength(1);
    const parsed = EpisodeSchema.safeParse({
      ...episodes[0],
      tenant_id: '00000000-0000-0000-0000-000000000000',
      created_at: episodes[0].created_at.toISOString(),
      ingested_at: episodes[0].ingested_at.toISOString(),
    });
    expect(parsed.success).toBe(true);
    expect(episodes[0].source_system).toBe('twitter');
  });
});
