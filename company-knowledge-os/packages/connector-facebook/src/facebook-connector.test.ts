import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { EpisodeSchema } from '@company-knowledge-os/core';
import { FacebookConnector } from './facebook-connector';

vi.mock('axios');

describe('FacebookConnector.fetchChanges', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('maps Facebook posts to valid IEpisode shape', async () => {
    (axios.get as any).mockResolvedValue({
      data: { data: [{ id: '1', message: 'hi', permalink_url: 'https://facebook.com/1', created_time: new Date().toISOString() }] },
    });

    const connector = new FacebookConnector({ clientId: 'x' }, 'token', 'page-1');
    const episodes = await connector.fetchChanges(new Date(0));

    expect(episodes).toHaveLength(1);
    const parsed = EpisodeSchema.safeParse({
      ...episodes[0],
      tenant_id: '00000000-0000-0000-0000-000000000000',
      created_at: episodes[0].created_at.toISOString(),
      ingested_at: episodes[0].ingested_at.toISOString(),
    });
    expect(parsed.success).toBe(true);
    expect(episodes[0].source_system).toBe('facebook');
  });
});
