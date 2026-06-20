import { describe, it, expect, vi } from 'vitest';
import { IEpisode } from '@company-knowledge-os/core';
import { ExtractionPipeline } from '../src/extraction-pipeline';

function makeEpisode(text: string, overrides: Partial<IEpisode> = {}): IEpisode {
  return {
    episode_id: 'ep-1',
    tenant_id: 'tenant-1',
    source_system: 'slack',
    source_id: 'src-1',
    source_version: 'v1',
    raw_pointer: 'https://example.com/src-1',
    parsed_hash: 'hash',
    parsed_content: { text, user: 'Alice', channel: 'Engineering' },
    author: 'alice',
    created_at: new Date('2026-01-01T00:00:00Z'),
    ingested_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('ExtractionPipeline', () => {
  it('extracts entities, facts, and relations', async () => {
    const entityDAO = {
      getOrCreateEntity: vi.fn().mockImplementation((tenantId, name, type) => ({
        entity_id: `id-${name}`,
        tenant_id: tenantId,
        name,
        entity_type: type,
      })),
    };
    const factDAO = {
      listFacts: vi.fn().mockResolvedValue([]),
      createFact: vi.fn().mockImplementation((fact) => ({ ...fact, fact_id: 'fact-1' })),
    };
    const relationDAO = {
      createRelation: vi.fn().mockImplementation((rel) => ({ ...rel, relation_id: 'rel-1' })),
    };

    const pipeline = new ExtractionPipeline(
      entityDAO as any,
      factDAO as any,
      relationDAO as any
    );

    const episode = makeEpisode(
      'Alice is part of Engineering. Alice updated ProjectAlpha. Bob mentioned ProjectAlpha.'
    );

    const result = await pipeline.extract(episode);

    expect(result.entities.length).toBeGreaterThan(0);
    expect(result.facts.length).toBeGreaterThan(0);
    expect(result.relations.length).toBeGreaterThan(0);
    expect(entityDAO.getOrCreateEntity).toHaveBeenCalled();
    expect(factDAO.createFact).toHaveBeenCalled();
    expect(relationDAO.createRelation).toHaveBeenCalled();
  });

  it('resolves relation entity ids from extracted entities', async () => {
    const entityDAO = {
      getOrCreateEntity: vi.fn().mockImplementation((tenantId, name, type) => ({
        entity_id: `id-${name.toLowerCase()}`,
        tenant_id: tenantId,
        name,
        entity_type: type,
      })),
    };
    const factDAO = {
      listFacts: vi.fn().mockResolvedValue([]),
      createFact: vi.fn().mockImplementation((fact) => ({ ...fact, fact_id: 'fact-1' })),
    };
    const relationDAO = {
      createRelation: vi.fn().mockImplementation((rel) => ({ ...rel, relation_id: 'rel-1' })),
    };

    const pipeline = new ExtractionPipeline(
      entityDAO as any,
      factDAO as any,
      relationDAO as any
    );

    const episode = makeEpisode('Alice is part of Engineering');
    const result = await pipeline.extract(episode);

    expect(result.relations.length).toBe(1);
    expect(result.relations[0].relation_type).toBe('PERSON_MEMBER_OF_TEAM');
  });
});
