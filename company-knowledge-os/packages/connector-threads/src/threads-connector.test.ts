import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { EpisodeSchema } from '@company-knowledge-os/core';
import { ThreadsConnector } from './threads-connector';

vi.mock('axios');

describe('ThreadsConnector.fetchChanges', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('maps Threads posts to valid IEpisode shape', async () => {
    // First call: getProfile (returns user id), second call: /threads (returns posts)
    (axios.get as any)
      .mockResolvedValueOnce({ data: { id: 'user-1', username: 'testuser' } })
      .mockResolvedValueOnce({
        data: { data: [{ id: '1', text: 'hi', permalink: 'https://threads.net/1', timestamp: new Date().toISOString() }] },
      });

    const connector = new ThreadsConnector({ enabled: true, extra: { accessToken: 'mock-token' } });
    const episodes = await connector.fetchChanges(new Date(0));

    expect(episodes).toHaveLength(1);
    const parsed = EpisodeSchema.safeParse({
      ...episodes[0],
      tenant_id: '00000000-0000-0000-0000-000000000000',
      created_at: episodes[0].created_at.toISOString(),
      ingested_at: episodes[0].ingested_at.toISOString(),
    });
    expect(parsed.success).toBe(true);
    expect(episodes[0].source_system).toBe('threads');
  });
});
