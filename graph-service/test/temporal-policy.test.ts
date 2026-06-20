import { beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { TemporalController } from '../src/api/temporal.routes.js';
import { graphService } from '../src/services/GraphService.js';
import { neo4jClient } from '../src/infra/neo4j.client.js';
import { policyEngine } from '../src/auth/PolicyEngine.js';
import { GraphNode } from '../src/domain/entities.js';
import { Fact } from '../src/domain/facts.js';

const tenantId = 'org_temporal_policy';
const entityId = 'entity_temporal_policy';
const from = '2026-06-01T00:00:00.000Z';
const to = '2026-06-30T00:00:00.000Z';
const asOf = '2026-06-15T00:00:00.000Z';

function sourceNode(sourceId: string, permissionHash: string | null): GraphNode {
  return {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    type: 'Document',
    canonical_name: sourceId,
    aliases: [],
    source_system: 'test',
    source_id: sourceId,
    confidence: 1,
    status: 'current',
    created_at: from,
    updated_at: from,
    valid_from: from,
    valid_to: null,
    recorded_from: from,
    recorded_to: null,
    last_seen_at: from,
    permissions_hash: permissionHash,
    source_url: null,
    properties: {},
  };
}

function fact(sourceId: string, value: string, status: Fact['status'] = 'current'): Fact {
  return {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    entity_id: entityId,
    predicate: status === 'contradicted' ? 'conflict' : 'status',
    value,
    confidence: 0.9,
    status,
    valid_from: from,
    valid_to: null,
    recorded_from: '2026-06-10T00:00:00.000Z',
    recorded_to: null,
    source_id: sourceId,
    evidence_spans: [value],
    last_seen_at: from,
  };
}

describe('TemporalController permission policy', () => {
  const controller = new TemporalController();

  beforeEach(async () => {
    await neo4jClient.clear();
    await graphService.clearSearchIndex();
    policyEngine.clear();

    await graphService.ingestNode(sourceNode('public_source', null));
    await graphService.ingestNode(sourceNode('restricted_source', 'executive'));

    for (const storedFact of [
      fact('public_source', 'PUBLIC_CURRENT'),
      fact('restricted_source', 'RESTRICTED_CURRENT'),
      fact('unknown_source', 'UNKNOWN_CURRENT'),
      fact('public_source', 'PUBLIC_CONFLICT', 'contradicted'),
      fact('restricted_source', 'RESTRICTED_CONFLICT', 'contradicted'),
      fact('unknown_source', 'UNKNOWN_CONFLICT', 'contradicted'),
    ]) {
      await neo4jClient.upsertFact(storedFact);
    }
  });

  it('keeps anonymous callers public-only across every temporal read', async () => {
    const request = { user: { tenant_id: tenantId } };
    const results = await Promise.all([
      controller.getFactsCurrent(entityId, request),
      controller.getFactsHistory(entityId, request),
      controller.getFactsAsOf(entityId, asOf, request),
      controller.getFactsChanges(entityId, from, to, request),
      controller.getFactsConflicts(entityId, request),
    ]);

    for (const facts of results) {
      expect(facts.length).toBeGreaterThan(0);
      expect(facts.every((storedFact) => storedFact.source_id === 'public_source')).toBe(true);
    }
  });

  it('honors granted hashes and admin access while failing closed for unknown sources', async () => {
    policyEngine.grantAccess({
      tenant_id: tenantId,
      user_id: 'granted_user',
      permission_hashes: ['executive'],
    });
    policyEngine.grantAccess({
      tenant_id: tenantId,
      user_id: 'admin_user',
      permission_hashes: [],
      is_admin: true,
    });

    for (const userId of ['granted_user', 'admin_user']) {
      const history = await controller.getFactsHistory(entityId, {
        user: { id: userId, tenant_id: tenantId },
      });
      expect(history.map((storedFact) => storedFact.value)).toContain('PUBLIC_CURRENT');
      expect(history.map((storedFact) => storedFact.value)).toContain('RESTRICTED_CURRENT');
      expect(history.map((storedFact) => storedFact.value)).not.toContain('UNKNOWN_CURRENT');
      expect(history.map((storedFact) => storedFact.value)).not.toContain('UNKNOWN_CONFLICT');
    }
  });

  it('does not treat caller-controlled headers as authenticated identity', async () => {
    policyEngine.grantAccess({
      tenant_id: tenantId,
      user_id: 'granted_user',
      permission_hashes: ['executive'],
    });

    const facts = await controller.getFactsCurrent(entityId, {
      headers: { 'x-user-id': 'granted_user' },
      user: { tenant_id: tenantId },
    } as any);

    expect(facts.map((storedFact) => storedFact.value)).toEqual(['PUBLIC_CURRENT']);
  });
});
