import { IEpisode, IEntity, IFact, IRelation } from '@company-knowledge-os/core';
import { EntityDAO, FactDAO, RelationDAO } from '@company-knowledge-os/database';
import { EntityExtractor } from './entity-extractor';
import { FactExtractor } from './fact-extractor';
import { RelationExtractor } from './relation-extractor';

export interface ExtractionResult {
  entities: IEntity[];
  facts: IFact[];
  relations: IRelation[];
}

export interface ExtractionPipelineOptions {
  entityExtractor?: EntityExtractor;
  factExtractor?: FactExtractor;
  relationExtractor?: RelationExtractor;
}

export class ExtractionPipeline {
  private entityExtractor: EntityExtractor;
  private factExtractor: FactExtractor;
  private relationExtractor: RelationExtractor;

  constructor(
    private entityDAO: EntityDAO,
    private factDAO: FactDAO,
    private relationDAO: RelationDAO,
    options: ExtractionPipelineOptions = {}
  ) {
    this.entityExtractor = options.entityExtractor ?? new EntityExtractor(this.entityDAO, this.factDAO);
    this.factExtractor = options.factExtractor ?? new FactExtractor();
    this.relationExtractor = options.relationExtractor ?? new RelationExtractor();
  }

  async extract(episode: IEpisode): Promise<ExtractionResult> {
    const { entities: localEntities } = await this.entityExtractor.extract(episode);

    const [entityResults, { facts: localFacts }, { relations: localRelations }] =
      await Promise.all([
        this.persistEntities(episode.tenant_id, localEntities),
        this.factExtractor.extract(episode),
        this.relationExtractor.extract(episode, localEntities),
      ]);

    const canonicalFacts = await this.canonicaliseFacts(localFacts);
    const factResults = await this.persistFacts(canonicalFacts);
    const relationResults = await this.persistRelations(localRelations);

    return {
      entities: entityResults,
      facts: factResults,
      relations: relationResults,
    };
  }

  private async persistEntities(
    tenantId: string,
    entities: IEntity[]
  ): Promise<IEntity[]> {
    const results: IEntity[] = [];
    for (const entity of entities) {
      const created = await this.entityDAO.getOrCreateEntity(
        tenantId,
        entity.name,
        entity.entity_type
      );
      results.push(created);
    }
    return results;
  }

  private async canonicaliseFacts(facts: IFact[]): Promise<IFact[]> {
    const activeFacts = facts.filter((f) => f.status === 'active');

    for (const fact of activeFacts) {
      const conflicts = await this.factDAO.listFacts(fact.tenant_id, {
        status: ['active'],
        subject: [fact.subject],
        predicate: [fact.predicate],
        limit: 1,
      });

      if (conflicts.length > 0 && conflicts[0].fact_id !== fact.fact_id) {
        await this.factDAO.updateFactStatus(
          conflicts[0].fact_id,
          'superseded',
          fact.fact_id
        );
      }
    }

    return facts;
  }

  private async persistFacts(facts: IFact[]): Promise<IFact[]> {
    const results: IFact[] = [];
    for (const fact of facts) {
      const created = await this.factDAO.createFact(fact);
      results.push(created);
    }
    return results;
  }

  private async persistRelations(relations: IRelation[]): Promise<IRelation[]> {
    const results: IRelation[] = [];
    for (const relation of relations) {
      const created = await this.relationDAO.createRelation(relation);
      results.push(created);
    }
    return results;
  }
}
