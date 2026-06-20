import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { EpisodeSchema } from '@company-knowledge-os/core';
import { YouTubeConnector } from './youtube-connector';

vi.mock('axios');

describe('YouTubeConnector.fetchChanges', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('maps YouTube search results to valid IEpisode shape', async () => {
    (axios.get as any).mockResolvedValue({
      data: { items: [{ id: { videoId: '1' }, snippet: { title: 'hi', publishedAt: new Date().toISOString() } }] },
    });

    const connector = new YouTubeConnector({ clientId: 'x' }, 'token', 'channel-1');
    const episodes = await connector.fetchChanges(new Date(0));

    expect(episodes).toHaveLength(1);
    const parsed = EpisodeSchema.safeParse({
      ...episodes[0],
      tenant_id: '00000000-0000-0000-0000-000000000000',
      created_at: episodes[0].created_at.toISOString(),
      ingested_at: episodes[0].ingested_at.toISOString(),
    });
    expect(parsed.success).toBe(true);
    expect(episodes[0].source_system).toBe('youtube');
  });
});
