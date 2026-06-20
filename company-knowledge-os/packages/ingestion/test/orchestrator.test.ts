import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IEpisode } from '@company-knowledge-os/core';
import { IngestionOrchestrator, IngestionJob } from '../src/orchestrator';

// Avoid constructing a real Bull queue (which would touch Redis).
vi.mock('bull', () => {
  class FakeQueue {
    constructor() {}
    add = vi.fn();
    process = vi.fn();
    on = vi.fn();
    close = vi.fn();
  }
  return { default: FakeQueue };
});

function makeJob(overrides: Partial<IngestionJob> = {}): IngestionJob {
  return {
    job_id: 'job-1',
    tenant_id: 'tenant-1',
    source_system: 'slack',
    source_id: 'src-123',
    source_version: 'v1',
    event_time: new Date('2026-01-01T00:00:00Z'),
    arrival_time: new Date('2026-01-01T00:00:01Z'),
    status: 'pending',
    retry_count: 0,
    error_message: null,
    processed_at: null,
    ...overrides,
  };
}

describe('IngestionOrchestrator.processIngestionJob', () => {
  const baseEpisode: IEpisode = {
    episode_id: 'ep-from-connector',
    tenant_id: 'wrong-tenant',
    source_system: 'slack',
    source_id: 'src-123',
    source_version: 'v1',
    raw_pointer: 'https://slack/src-123',
    parsed_hash: 'hash',
    parsed_content: { text: 'hello' },
    author: 'alice',
    created_at: new Date('2026-01-01T00:00:00Z'),
    ingested_at: new Date('2026-01-01T00:00:00Z'),
  };

  let episodeDAO: { createEpisode: ReturnType<typeof vi.fn> };
  let factDAO: any;
  let entityDAO: any;
  let extractor: { extract: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    episodeDAO = { createEpisode: vi.fn().mockResolvedValue(undefined) };
    factDAO = {};
    entityDAO = {};
    extractor = { extract: vi.fn().mockResolvedValue({ entities: [], facts: [] }) };
  });

  it('uses the registered connector and runs the extractor', async () => {
    const fetchObject = vi.fn().mockResolvedValue({ ...baseEpisode });
    const connector = { name: 'slack', fetchObject } as any;
    const registry = {
      get: vi.fn().mockReturnValue(connector),
    } as any;

    const orchestrator = new IngestionOrchestrator(
      'redis://localhost:6379',
      episodeDAO as any,
      factDAO,
      entityDAO,
      registry,
      extractor as any
    );

    await orchestrator.processIngestionJob(makeJob());

    expect(registry.get).toHaveBeenCalledWith('slack');
    expect(fetchObject).toHaveBeenCalledWith('src-123');
    expect(episodeDAO.createEpisode).toHaveBeenCalledTimes(1);
    const storedEpisode = episodeDAO.createEpisode.mock.calls[0][0] as IEpisode;
    expect(storedEpisode.tenant_id).toBe('tenant-1');
    expect(extractor.extract).toHaveBeenCalledTimes(1);
    expect(extractor.extract).toHaveBeenCalledWith(storedEpisode);
  });

  it('falls back to a placeholder episode when no connector is registered', async () => {
    const registry = { get: vi.fn().mockReturnValue(undefined) } as any;

    const orchestrator = new IngestionOrchestrator(
      'redis://localhost:6379',
      episodeDAO as any,
      factDAO,
      entityDAO,
      registry,
      extractor as any
    );

    await orchestrator.processIngestionJob(makeJob({ source_system: 'unknown' }));

    expect(registry.get).toHaveBeenCalledWith('unknown');
    expect(episodeDAO.createEpisode).toHaveBeenCalledTimes(1);
    const storedEpisode = episodeDAO.createEpisode.mock.calls[0][0] as IEpisode;
    expect(storedEpisode.tenant_id).toBe('tenant-1');
    expect(storedEpisode.source_system).toBe('unknown');
    expect(extractor.extract).toHaveBeenCalledWith(storedEpisode);
  });
});
