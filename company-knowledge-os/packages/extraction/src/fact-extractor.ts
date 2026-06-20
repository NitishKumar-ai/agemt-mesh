import { IEpisode, IFact } from '@company-knowledge-os/core';

export interface FactExtractionResult {
  facts: IFact[];
}

export class FactExtractor {
  async extract(episode: IEpisode): Promise<FactExtractionResult> {
    const facts = await this.localFactExtraction(episode);
    return { facts };
  }

  private async localFactExtraction(episode: IEpisode): Promise<IFact[]> {
    const facts: IFact[] = [];

    if (!episode.parsed_content || typeof episode.parsed_content !== 'object') {
      return facts;
    }

    const content = String(episode.parsed_content.text || '');

    const patterns = [
      {
        pattern: /(\w+) (created|updated|modified|deleted|moved) (\w+)/gi,
        predicate: 'MODIFIED',
      },
      {
        pattern: /(\w+) (belongs to|is part of|belongs_to) (\w+)/gi,
        predicate: 'BELONGS_TO',
      },
      {
        pattern: /(\w+) (decided|approved|rejected|voted) (\w+)/gi,
        predicate: 'DECIDED',
      },
      {
        pattern: /(\w+) (mentioned|discussed) (\w+)/gi,
        predicate: 'MENTIONS',
      },
    ];

    for (const { pattern, predicate } of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        facts.push({
          fact_id: crypto.randomUUID(),
          tenant_id: episode.tenant_id,
          subject: match[1],
          predicate,
          object: match[3],
          confidence: 0.8,
          status: 'active',
          observed_at: episode.created_at,
          ingested_at: new Date(),
          valid_from: episode.created_at,
          valid_to: null,
          superseded_by: null,
          episode_ids: [episode.episode_id],
          extractor_version: '1.1.0',
        });
      }
    }

    return facts;
  }
}
