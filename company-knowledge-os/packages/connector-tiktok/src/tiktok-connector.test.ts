import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { EpisodeSchema } from '@company-knowledge-os/core';
import { TikTokConnector } from './tiktok-connector';

vi.mock('axios');

describe('TikTokConnector.fetchChanges', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('maps TikTok videos to valid IEpisode shape', async () => {
    (axios.post as any).mockResolvedValue({
      data: { data: { videos: [{ id: '1', title: 'hi', share_url: 'https://tiktok.com/v/1', create_time: Math.floor(Date.now() / 1000) }] } },
    });

    const connector = new TikTokConnector({ clientId: 'x' }, 'token');
    const episodes = await connector.fetchChanges(new Date(0));

    expect(episodes).toHaveLength(1);
    const parsed = EpisodeSchema.safeParse({
      ...episodes[0],
      tenant_id: '00000000-0000-0000-0000-000000000000',
      created_at: episodes[0].created_at.toISOString(),
      ingested_at: episodes[0].ingested_at.toISOString(),
    });
    expect(parsed.success).toBe(true);
    expect(episodes[0].source_system).toBe('tiktok');
  });
});
