import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphController } from '../src/api/graph.routes.js';
import { policyEngine } from '../src/auth/PolicyEngine.js';
import { graphService } from '../src/services/GraphService.js';
import { telemetryMetricsRegistry } from '../src/services/TelemetryMetricsRegistry.js';

const tenantId = 'tenant_policy_test';
const anonymousRequest = {};

describe('GraphController permission policy', () => {
  let controller: GraphController;

  beforeEach(() => {
    policyEngine.clear();
    controller = new GraphController();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    policyEngine.clear();
  });

  it('ignores caller-provided permission escalation fields during search', async () => {
    const search = vi.spyOn(graphService, 'search').mockResolvedValue([]);

    await controller.search(
      {
        tenantId,
        query: 'board acquisition',
        options: {
          limit: 5,
          minScore: 0.4,
          resourceTypes: ['Document'],
          allowedPermissionHashes: ['executive'],
          includePublic: false,
        },
      },
      anonymousRequest,
    );

    expect(search).toHaveBeenCalledWith(tenantId, 'board acquisition', {
      limit: 5,
      minScore: 0.4,
      resourceTypes: ['Document'],
      allowedPermissionHashes: [],
      includePublic: true,
      bypassPermissions: false,
    });
  });

  it('uses public-only search options for anonymous callers even when identity is spoofed', async () => {
    policyEngine.grantAccess({
      tenant_id: tenantId,
      user_id: 'spoofed-admin',
      permission_hashes: ['executive'],
      is_admin: true,
    });
    const search = vi.spyOn(graphService, 'search').mockResolvedValue([]);

    await controller.search(
      {
        tenantId,
        query: 'roadmap',
        options: { allowedPermissionHashes: ['executive'] },
        userId: 'spoofed-admin',
      } as Parameters<GraphController['search']>[0],
      {
        headers: { 'x-user-id': 'spoofed-admin' },
        query: { userId: 'spoofed-admin' },
      },
    );

    expect(search).toHaveBeenCalledWith(tenantId, 'roadmap', {
      allowedPermissionHashes: [],
      includePublic: true,
      bypassPermissions: false,
    });
  });

  it('derives granted search permissions only from request.user.id', async () => {
    policyEngine.grantAccess({
      tenant_id: tenantId,
      user_id: 'granted-user',
      permission_hashes: ['finance', 'engineering'],
    });
    const search = vi.spyOn(graphService, 'search').mockResolvedValue([]);

    await controller.search(
      {
        tenantId,
        query: 'quarterly plan',
        options: {
          limit: 3,
          allowedPermissionHashes: ['executive'],
          includePublic: false,
        },
      },
      { user: { id: 'granted-user' } },
    );

    expect(search).toHaveBeenCalledWith(tenantId, 'quarterly plan', {
      limit: 3,
      allowedPermissionHashes: ['finance', 'engineering'],
      includePublic: true,
      bypassPermissions: false,
    });
  });

  it('derives the full tenant search bypass only from authenticated admin policy', async () => {
    policyEngine.grantAccess({
      tenant_id: tenantId,
      user_id: 'tenant-admin',
      permission_hashes: [],
      is_admin: true,
    });
    const search = vi.spyOn(graphService, 'search').mockResolvedValue([]);

    await controller.search(
      {
        tenantId,
        query: 'all tenant knowledge',
        options: { bypassPermissions: false },
      },
      { user: { id: 'tenant-admin' } },
    );

    expect(search).toHaveBeenCalledWith(tenantId, 'all tenant knowledge', {
      allowedPermissionHashes: [],
      includePublic: true,
      bypassPermissions: true,
    });
  });

  it('requires request.user to carry the tenant admin identity', async () => {
    policyEngine.grantAccess({
      tenant_id: tenantId,
      user_id: 'tenant-admin',
      permission_hashes: [],
      is_admin: true,
    });
    const getSearchInfo = vi.spyOn(graphService, 'getSearchInfo').mockResolvedValue({
      provider: 'test',
      model: 'test',
      dimensions: 1,
      indexedDocuments: 0,
    });

    await expect(
      controller.getSearchInfo({
        headers: { authorization: 'Bearer tenant-admin' },
        query: { userId: 'tenant-admin' },
        user: { tenant_id: tenantId },
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.getSearchInfo({ user: { id: 'tenant-admin', tenant_id: tenantId } }),
    ).resolves.toMatchObject({ indexedDocuments: 0 });

    expect(getSearchInfo).toHaveBeenCalledTimes(1);
    expect(getSearchInfo).toHaveBeenCalledWith(tenantId);
  });

  it('forbids every operational and traversal endpoint for non-admin callers', async () => {
    const request = { user: { id: 'regular-user', tenant_id: tenantId } };
    const operations = [
      () => controller.getMetrics(request),
      () => controller.getSearchInfo(request),
      () => controller.reindexSearch({ tenantId, batchSize: 10 }, request),
      () => controller.evaluateSearch({ tenantId, cases: [], k: 5 }, request),
      () =>
        controller.ingestNode(
          { tenant_id: tenantId } as Parameters<GraphController['ingestNode']>[0],
          request,
        ),
      () =>
        controller.ingestRelationship(
          { tenant_id: tenantId } as Parameters<GraphController['ingestRelationship']>[0],
          request,
        ),
      () =>
        controller.ingestFact(
          { tenant_id: tenantId } as Parameters<GraphController['ingestFact']>[0],
          request,
        ),
      () => controller.runCypher({ tenantId, query: 'MATCH (n) RETURN n' }, request),
      () => controller.getProjectContext('project-1', request),
      () => controller.resolveEntities(request),
    ];

    for (const operation of operations) {
      await expect(operation()).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('allows tenant admins to call every gated operation', async () => {
    policyEngine.grantAccess({
      tenant_id: tenantId,
      user_id: 'tenant-admin',
      permission_hashes: [],
      is_admin: true,
    });
    const request = { user: { id: 'tenant-admin', tenant_id: tenantId } };
    vi.spyOn(telemetryMetricsRegistry, 'getDashboardMetrics').mockReturnValue(
      {} as ReturnType<typeof telemetryMetricsRegistry.getDashboardMetrics>,
    );
    vi.spyOn(graphService, 'getSearchInfo').mockResolvedValue({
      provider: 'test',
      model: 'test',
      dimensions: 1,
      indexedDocuments: 0,
    });
    vi.spyOn(graphService, 'reindexSearch').mockResolvedValue({
      tenantId,
      indexed: 0,
      durationMs: 0,
      provider: 'test',
      model: 'test',
      dimensions: 1,
    });
    vi.spyOn(graphService, 'evaluateSearch').mockResolvedValue({
      cases: 0,
      k: 5,
      recallAtK: 0,
      precisionAtK: 0,
      meanReciprocalRank: 0,
      failures: [],
    });
    vi.spyOn(graphService, 'getProjectContext').mockResolvedValue(null);
    vi.spyOn(graphService, 'resolveOutstandingEntities').mockResolvedValue({
      resolvedCount: 0,
      autoMergedCount: 0,
      pendingReviewCount: 0,
      pairs: [],
    });
    vi.spyOn(graphService, 'ingestNode').mockResolvedValue();
    vi.spyOn(graphService, 'ingestRelationship').mockResolvedValue();
    vi.spyOn(graphService, 'ingestFact').mockResolvedValue();

    await expect(controller.getMetrics(request)).resolves.toEqual({});
    await expect(controller.getSearchInfo(request)).resolves.toMatchObject({
      indexedDocuments: 0,
    });
    await expect(
      controller.reindexSearch({ tenantId, batchSize: 10 }, request),
    ).resolves.toMatchObject({ tenantId });
    await expect(
      controller.evaluateSearch({ tenantId, cases: [], k: 5 }, request),
    ).resolves.toMatchObject({ cases: 0 });
    await expect(
      controller.ingestNode(
        { tenant_id: tenantId } as Parameters<GraphController['ingestNode']>[0],
        request,
      ),
    ).resolves.toEqual({ success: true });
    await expect(
      controller.ingestRelationship(
        { tenant_id: tenantId } as Parameters<GraphController['ingestRelationship']>[0],
        request,
      ),
    ).resolves.toEqual({ success: true });
    await expect(
      controller.ingestFact(
        { tenant_id: tenantId } as Parameters<GraphController['ingestFact']>[0],
        request,
      ),
    ).resolves.toEqual({ success: true });
    await expect(
      controller.runCypher({ tenantId, query: 'MATCH (n) RETURN n' }, request),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.getProjectContext('project-1', request)).resolves.toBeNull();
    await expect(controller.resolveEntities(request)).resolves.toMatchObject({
      resolvedCount: 0,
    });
  });

  it('rejects cross-tenant search evaluation cases even for an admin', async () => {
    policyEngine.grantAccess({
      tenant_id: tenantId,
      user_id: 'tenant-admin',
      permission_hashes: [],
      is_admin: true,
    });
    const evaluateSearch = vi.spyOn(graphService, 'evaluateSearch').mockResolvedValue({
      cases: 0,
      k: 10,
      recallAtK: 0,
      precisionAtK: 0,
      meanReciprocalRank: 0,
      failures: [],
    });

    await expect(
      controller.evaluateSearch(
        {
          tenantId,
          cases: [
            {
              id: 'cross-tenant',
              tenantId: 'other-tenant',
              query: 'secret',
              expectedResourceIds: [],
            },
          ],
        },
        { user: { id: 'tenant-admin' } },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(evaluateSearch).not.toHaveBeenCalled();
  });

  it('requires explicit tenant IDs instead of using a fallback', async () => {
    await expect(controller.getMetrics(anonymousRequest)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.resolveEntities(anonymousRequest)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      controller.search({ tenantId: '', query: 'anything' }, anonymousRequest),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.ingestNode(
        { tenant_id: '' } as Parameters<GraphController['ingestNode']>[0],
        anonymousRequest,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
