import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { GraphService } from '../src/services/GraphService.js';
import { neo4jClient } from '../src/infra/neo4j.client.js';
import { postgresClient } from '../src/infra/postgres.client.js';
import { GraphNode } from '../src/domain/entities.js';
import { PolicyEngine } from '../src/auth/PolicyEngine.js';

describe('PolicyEngine', () => {
  let policy: PolicyEngine;

  beforeEach(() => {
    policy = new PolicyEngine();
  });

  it('allows explicitly public sources and denies unregistered sources', () => {
    const access = policy.resolveAccess('org_1', 'user_anon');
    expect(policy.isVisible(null, access)).toBe(true);
    expect(policy.isVisible(undefined, access)).toBe(false);
  });

  it('denies a restricted permission hash to a user with no grant', () => {
    const access = policy.resolveAccess('org_1', 'user_no_grant');
    expect(policy.isVisible('executive', access)).toBe(false);
  });

  it('allows a restricted permission hash once granted', () => {
    policy.grantAccess({
      tenant_id: 'org_1',
      user_id: 'user_exec',
      permission_hashes: ['executive'],
    });
    const access = policy.resolveAccess('org_1', 'user_exec');
    expect(policy.isVisible('executive', access)).toBe(true);
    expect(policy.isVisible('finance', access)).toBe(false);
  });

  it('admins see everything regardless of grants', () => {
    policy.grantAccess({
      tenant_id: 'org_1',
      user_id: 'admin_1',
      permission_hashes: [],
      is_admin: true,
    });
    const access = policy.resolveAccess('org_1', 'admin_1');
    expect(policy.isVisible('executive', access)).toBe(true);
    expect(policy.isVisible('anything', access)).toBe(true);
  });

  it('does not leak grants across tenants', () => {
    policy.grantAccess({
      tenant_id: 'org_1',
      user_id: 'shared_user',
      permission_hashes: ['executive'],
    });
    const accessInOtherTenant = policy.resolveAccess('org_2', 'shared_user');
    expect(policy.isVisible('executive', accessInOtherTenant)).toBe(false);
  });

  it('revoking a specific permission hash removes only that grant', () => {
    policy.grantAccess({
      tenant_id: 'org_1',
      user_id: 'user_1',
      permission_hashes: ['executive', 'finance'],
    });
    policy.revokeAccess('org_1', 'user_1', 'executive');
    const access = policy.resolveAccess('org_1', 'user_1');
    expect(policy.isVisible('executive', access)).toBe(false);
    expect(policy.isVisible('finance', access)).toBe(true);
  });
});

describe('GraphService.getSourcePermissionHash', () => {
  beforeEach(async () => {
    await neo4jClient.clear();
  });

  it('returns the permissions_hash recorded at ingest time', async () => {
    const graphService = new GraphService(neo4jClient, postgresClient);
    const tenantId = 'org_perm_test';
    const node: GraphNode = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      type: 'Document',
      canonical_name: 'Board deck',
      aliases: [],
      source_system: 'gdrive',
      source_id: 'gdrive_board_deck',
      confidence: 0.9,
      status: 'current',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      valid_from: new Date().toISOString(),
      valid_to: null,
      recorded_from: new Date().toISOString(),
      recorded_to: null,
      last_seen_at: new Date().toISOString(),
      permissions_hash: 'executive',
      source_url: null,
      properties: {},
    };

    await graphService.ingestNode(node);

    expect(graphService.getSourcePermissionHash(tenantId, 'gdrive_board_deck')).toBe('executive');
    expect(graphService.getSourcePermissionHash(tenantId, node.id)).toBe('executive');
  });

  it('returns undefined for a source that was never ingested', () => {
    const graphService = new GraphService(neo4jClient, postgresClient);
    expect(
      graphService.getSourcePermissionHash('org_perm_test', 'never_seen_source'),
    ).toBeUndefined();
  });

  it('scopes identical source IDs to their tenant', async () => {
    const graphService = new GraphService(neo4jClient, postgresClient);
    const now = new Date().toISOString();
    const baseNode: GraphNode = {
      id: crypto.randomUUID(),
      tenant_id: 'org_a',
      type: 'Document',
      canonical_name: 'Shared source name',
      aliases: [],
      source_system: 'gdrive',
      source_id: 'same_external_id',
      confidence: 1,
      status: 'current',
      created_at: now,
      updated_at: now,
      valid_from: now,
      valid_to: null,
      recorded_from: now,
      recorded_to: null,
      last_seen_at: now,
      permissions_hash: 'team-a',
      source_url: null,
      properties: {},
    };
    await graphService.ingestNode(baseNode);
    await graphService.ingestNode({
      ...baseNode,
      id: crypto.randomUUID(),
      tenant_id: 'org_b',
      permissions_hash: 'team-b',
    });

    expect(graphService.getSourcePermissionHash('org_a', 'same_external_id')).toBe('team-a');
    expect(graphService.getSourcePermissionHash('org_b', 'same_external_id')).toBe('team-b');
  });
});
