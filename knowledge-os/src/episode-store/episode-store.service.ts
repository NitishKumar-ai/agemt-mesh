
import { Injectable } from '@nestjs/common';

export interface Episode {
  id: string;
  tenantId: string;
  source: string;
  timestamp: Date;
  rawPayload: any; // Immutable raw source capture
}

@Injectable()
export class EpisodeStoreService {
  /**
   * Appends a new episode (immutable capture)
   */
  async appendEpisode(episode: Omit<Episode, 'id'>): Promise<string> {
    // TODO: Implement append to PostgreSQL
    return 'new-episode-id';
  }
}
