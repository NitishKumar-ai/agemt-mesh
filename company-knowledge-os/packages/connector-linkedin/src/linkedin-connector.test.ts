import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { EpisodeSchema } from '@company-knowledge-os/core';
import { LinkedInConnector } from './linkedin-connector';

vi.mock('axios');

describe('LinkedInConnector.fetchChanges', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('maps LinkedIn posts to valid IEpisode shape', async () => {
    (axios.get as any).mockResolvedValue({
      data: {
        elements: [
          {
            id: 'urn:li:ugcPost:123',
            author: 'urn:li:person:abc',
            created: { time: Date.now() },
            lastModified: { time: Date.now() },
            specificContent: { 'com.linkedin.ugc.ShareContent': { shareCommentary: { text: 'hello' } } },
          },
        ],
      },
    });

    const connector = new LinkedInConnector({ enabled: true, extra: { accessToken: 'mock-token', authorUrn: 'urn:li:person:abc' } });
    const episodes = await connector.fetchChanges(new Date(0));

    expect(episodes).toHaveLength(1);
    const parsed = EpisodeSchema.safeParse({
      ...episodes[0],
      tenant_id: '00000000-0000-0000-0000-000000000000',
      created_at: episodes[0].created_at.toISOString(),
      ingested_at: episodes[0].ingested_at.toISOString(),
    });
    expect(parsed.success).toBe(true);
    expect(episodes[0].source_system).toBe('linkedin');
    expect(episodes[0].source_id).toBe('urn:li:ugcPost:123');
  });

  it('filters out posts older than `since`', async () => {
    (axios.get as any).mockResolvedValue({
      data: {
        elements: [{ id: 'old', created: { time: new Date('2020-01-01').getTime() } }],
      },
    });

    const connector = new LinkedInConnector({ enabled: true, extra: { accessToken: 'mock-token', authorUrn: 'urn:li:person:abc' } });
    const episodes = await connector.fetchChanges(new Date('2024-01-01'));
    expect(episodes).toHaveLength(0);
  });
});
