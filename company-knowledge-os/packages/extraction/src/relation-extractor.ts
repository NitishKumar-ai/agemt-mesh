import { IEpisode, IEntity, IRelation } from '@company-knowledge-os/core';

export interface RelationExtractionResult {
  relations: IRelation[];
}

export interface RelationPattern {
  pattern: RegExp;
  relation_type: string;
}

export const DEFAULT_RELATION_PATTERNS: RelationPattern[] = [
  {
    pattern: /(\w+) (?:is part of|works on|belongs to) (?:team )?(\w+)/gi,
    relation_type: 'PERSON_MEMBER_OF_TEAM',
  },
  {
    pattern: /(\w+) (?:owns|leads) (?:project )?(\w+)/gi,
    relation_type: 'PERSON_OWNS_PROJECT',
  },
  {
    pattern: /(\w+) (?:report(?:s)? to|manager is) (?:manager )?(\w+)/gi,
    relation_type: 'PERSON_REPORTS_TO',
  },
  {
    pattern: /(\w+) (?:collaborat(?:e|ed|es) with|worked with) (\w+)/gi,
    relation_type: 'PERSON_COLLABORATES_WITH',
  },
];

export class RelationExtractor {
  constructor(private patterns: RelationPattern[] = DEFAULT_RELATION_PATTERNS) {}

  async extract(
    episode: IEpisode,
    entities?: IEntity[]
  ): Promise<RelationExtractionResult> {
    const relations = await this.localRelationExtraction(episode, entities);
    return { relations };
  }

  private async localRelationExtraction(
    episode: IEpisode,
    entities?: IEntity[]
  ): Promise<IRelation[]> {
    const relations: IRelation[] = [];

    if (!episode.parsed_content || typeof episode.parsed_content !== 'object') {
      return relations;
    }

    const content = String(episode.parsed_content.text || '');

    for (const { pattern, relation_type } of this.patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const sourceName = match[1];
        const targetName = match[2];

        const sourceEntityId = this.resolveEntityId(sourceName, entities);
        const targetEntityId = this.resolveEntityId(targetName, entities);

        if (!sourceEntityId || !targetEntityId) {
          continue;
        }

        relations.push({
          relation_id: crypto.randomUUID(),
          tenant_id: episode.tenant_id,
          relation_type,
          source_entity_id: sourceEntityId,
          target_entity_id: targetEntityId,
          confidence: 0.8,
          status: 'active',
          observed_at: episode.created_at,
          ingested_at: new Date(),
          episode_ids: [episode.episode_id],
          extractor_version: '1.0.0',
        });
      }
    }

    return relations;
  }

  private resolveEntityId(
    name: string,
    entities?: IEntity[]
  ): string | undefined {
    if (!entities) return undefined;
    const normalized = name.toLowerCase();
    const entity = entities.find(
      (e) =>
        e.name.toLowerCase() === normalized ||
        e.aliases?.some((a) => a.toLowerCase() === normalized)
    );
    return entity?.entity_id;
  }
}
