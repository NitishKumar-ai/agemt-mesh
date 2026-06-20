import { IEpisode, IEntity, IFact } from '@company-knowledge-os/core';
import { EntityDAO, FactDAO } from '@company-knowledge-os/database';

export interface ExtractionResult {
  entities: IEntity[];
  facts: IFact[];
}

export class EntityExtractor {
  constructor(
    private entityDAO: EntityDAO,
    private factDAO: FactDAO,
    private openaiApiKey?: string
  ) {}

  async extract(episode: IEpisode): Promise<ExtractionResult> {
    const entities: IEntity[] = [];
    const facts: IFact[] = [];

    // Two-pass extraction
    // Pass 1: Local extraction from episode
    const localEntities = await this.localExtraction(episode);
    const localFacts = await this.localFactExtraction(episode);

    // Pass 2: Canonicalisation and graph updates
    const canonicalEntities = await this.canonicaliseEntities(localEntities);
    const canonicalFacts = await this.canonicaliseFacts(localFacts);

    // Store entities
    for (const entity of canonicalEntities) {
      const created = await this.entityDAO.getOrCreateEntity(
        episode.tenant_id,
        entity.name,
        entity.entity_type
      );
      entities.push(created);
    }

    // Store facts
    for (const fact of canonicalFacts) {
      const created = await this.factDAO.createFact(fact);
      facts.push(created);
    }

    return { entities, facts };
  }

  private async localExtraction(episode: IEpisode): Promise<IEntity[]> {
    const entities: IEntity[] = [];

    // Extract entities from parsed content
    if (episode.parsed_content) {
      // Extract people mentions
      if (episode.parsed_content.user) {
        entities.push({
          entity_id: crypto.randomUUID(),
          tenant_id: episode.tenant_id,
          name: episode.parsed_content.user,
          entity_type: 'person',
          aliases: [],
          source_refs: [{ episode_id: episode.episode_id, position: 'author' }],
        });
      }

      // Extract team mentions
      if (episode.parsed_content.channel) {
        entities.push({
          entity_id: crypto.randomUUID(),
          tenant_id: episode.tenant_id,
          name: episode.parsed_content.channel,
          entity_type: 'team',
          aliases: [],
          source_refs: [{ episode_id: episode.episode_id, position: 'channel' }],
        });
      }

      // Extract project names (simple heuristic)
      const content = episode.parsed_content.text || '';
      const projectPatterns = /\b(project|feature|task|issue):\s*([A-Za-z0-9_-]+)/gi;
      let match;
      while ((match = projectPatterns.exec(content)) !== null) {
        entities.push({
          entity_id: crypto.randomUUID(),
          tenant_id: episode.tenant_id,
          name: match[2],
          entity_type: 'project',
          aliases: [],
          source_refs: [{ episode_id: episode.episode_id, position: 'text' }],
        });
      }
    }

    return entities;
  }

  private async localFactExtraction(episode: IEpisode): Promise<IFact[]> {
    const facts: IFact[] = [];

    if (!episode.parsed_content) return facts;

    const content = episode.parsed_content.text || '';

    // Simple rule-based fact extraction
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
          extractor_version: '1.0.0',
        });
      }
    }

    return facts;
  }

  private async canonicaliseEntities(entities: IEntity[]): Promise<IEntity[]> {
    // Merge entities with same name and type
    const canonicalMap = new Map<string, IEntity>();

    for (const entity of entities) {
      const key = `${entity.name}:${entity.entity_type}`;
      if (canonicalMap.has(key)) {
        const existing = canonicalMap.get(key)!;
        existing.source_refs = [...(existing.source_refs ?? []), ...(entity.source_refs ?? [])];
      } else {
        canonicalMap.set(key, entity);
      }
    }

    return Array.from(canonicalMap.values());
  }

  private async canonicaliseFacts(facts: IFact[]): Promise<IFact[]> {
    // Check for conflicting facts
    const activeFacts = facts.filter((f) => f.status === 'active');

    for (const fact of activeFacts) {
      // Check for conflicting facts with same subject and predicate
      const conflicts = await this.factDAO.listFacts(fact.tenant_id, {
        status: ['active'],
        subject: [fact.subject],
        predicate: [fact.predicate],
        limit: 1,
      });

      if (conflicts.length > 0 && conflicts[0].fact_id !== fact.fact_id) {
        // Mark previous fact as superseded
        await this.factDAO.updateFactStatus(conflicts[0].fact_id, 'superseded', fact.fact_id);
      }
    }

    return facts;
  }

  async extractWithLLM(episode: IEpisode): Promise<ExtractionResult> {
    // TODO: Implement LLM-based extraction
    // This would use OpenAI or similar to extract entities and facts
    console.log('LLM extraction not implemented yet');
    return { entities: [], facts: [] };
  }
}