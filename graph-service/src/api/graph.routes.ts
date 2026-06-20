import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { graphService } from '../services/GraphService.js';
import { telemetryMetricsRegistry } from '../services/TelemetryMetricsRegistry.js';
import { GraphNode } from '../domain/entities.js';
import { GraphRelationship } from '../domain/relationships.js';
import { Fact } from '../domain/facts.js';
import type { RetrievalEvaluationCase } from '../search/RetrievalEvaluationService.js';
import type { SearchTextOptions } from '../search/VectorSearchService.js';
import type { EntityResolutionReport } from '../jobs/entity-resolution.job.js';
import { policyEngine } from '../auth/PolicyEngine.js';
import { RequestWithPrincipal, resolveRequestUserId, resolveRequestTenantId } from '../auth/RequestIdentity.js';

@ApiTags('graph')
@Controller('api/graph')
export class GraphController {
  private readonly service = graphService;
  private readonly policy = policyEngine;

  @Get('metrics')
  async getMetrics(
    @Req() request: RequestWithPrincipal,
  ): Promise<unknown> {
    const tenantId = this.requireTenantId(resolveRequestTenantId(request), 'tenant_id');
    this.requireTenantAdmin(tenantId, request);
    return telemetryMetricsRegistry.getDashboardMetrics();
  }

  @Post('search')
  async search(
    @Body()
    body: {
      tenantId: string;
      query: string;
      options?: SearchTextOptions;
    },
    @Req() request: RequestWithPrincipal,
  ): Promise<unknown[]> {
    const tenantId = this.requireTenantId(body.tenantId, 'tenantId');
    const access = this.policy.resolveAccess(tenantId, resolveRequestUserId(request));
    const safeOptions = { ...body.options };
    delete safeOptions.allowedPermissionHashes;
    delete safeOptions.includePublic;
    delete safeOptions.bypassPermissions;

    return this.service.search(tenantId, body.query, {
      ...safeOptions,
      allowedPermissionHashes: [...access.allowedPermissionHashes],
      includePublic: true,
      bypassPermissions: access.isAdmin,
    });
  }

  @Get('search/info')
  async getSearchInfo(
    @Req() request: RequestWithPrincipal,
  ): Promise<unknown> {
    const tenantId = this.requireTenantId(resolveRequestTenantId(request), 'tenant_id');
    this.requireTenantAdmin(tenantId, request);
    return this.service.getSearchInfo(tenantId);
  }

  @Post('search/reindex')
  async reindexSearch(
    @Body() body: { tenantId: string; batchSize?: number },
    @Req() request: RequestWithPrincipal,
  ): Promise<unknown> {
    const tenantId = this.requireTenantId(body.tenantId, 'tenantId');
    this.requireTenantAdmin(tenantId, request);
    return this.service.reindexSearch(tenantId, body.batchSize);
  }

  @Post('search/evaluate')
  async evaluateSearch(
    @Body() body: { tenantId: string; cases: RetrievalEvaluationCase[]; k?: number },
    @Req() request: RequestWithPrincipal,
  ): Promise<unknown> {
    const tenantId = this.requireTenantId(body.tenantId, 'tenantId');
    this.requireTenantAdmin(tenantId, request);
    if (body.cases.some((testCase) => testCase.tenantId !== tenantId)) {
      throw new ForbiddenException('Search evaluation cases must match the authorized tenant');
    }
    return this.service.evaluateSearch(body.cases, body.k);
  }

  @Post('nodes')
  async ingestNode(
    @Body() node: GraphNode,
    @Req() request: RequestWithPrincipal,
  ): Promise<{ success: boolean }> {
    const tenantId = this.requireTenantId(node.tenant_id, 'tenant_id');
    this.requireTenantAdmin(tenantId, request);
    await this.service.ingestNode(node);
    return { success: true };
  }

  @Post('relationships')
  async ingestRelationship(
    @Body() rel: GraphRelationship,
    @Req() request: RequestWithPrincipal,
  ): Promise<{ success: boolean }> {
    const tenantId = this.requireTenantId(rel.tenant_id, 'tenant_id');
    this.requireTenantAdmin(tenantId, request);
    await this.service.ingestRelationship(rel);
    return { success: true };
  }

  @Post('facts')
  async ingestFact(
    @Body() fact: Fact,
    @Req() request: RequestWithPrincipal,
    @Query('authorityMap') authorityMapStr?: string,
  ): Promise<{ success: boolean }> {
    const tenantId = this.requireTenantId(fact.tenant_id, 'tenant_id');
    this.requireTenantAdmin(tenantId, request);
    let authMap: Record<string, number> = {};
    if (authorityMapStr) {
      try {
        authMap = JSON.parse(authorityMapStr);
      } catch {
        // use default
      }
    }
    await this.service.ingestFact(fact, authMap);
    return { success: true };
  }

  @Post('cypher')
  async runCypher(
    @Body() body: { tenantId: string; query: string; params?: Record<string, unknown> },
    @Req() request: RequestWithPrincipal,
  ): Promise<unknown[]> {
    const tenantId = this.requireTenantId(body.tenantId, 'tenantId');
    this.requireTenantAdmin(tenantId, request);
    throw new ForbiddenException(
      'Arbitrary Cypher is not exposed through the tenant API; use a scoped graph endpoint',
    );
  }

  @Get('context/:projectId')
  async getProjectContext(
    @Param('projectId') projectId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<unknown> {
    const tenantId = this.requireTenantId(resolveRequestTenantId(request), 'tenant_id');
    this.requireTenantAdmin(tenantId, request);
    return await this.service.getProjectContext(projectId, tenantId);
  }

  @Post('resolve')
  async resolveEntities(
    @Req() request: RequestWithPrincipal,
  ): Promise<EntityResolutionReport> {
    const tenantId = this.requireTenantId(resolveRequestTenantId(request), 'tenant_id');
    this.requireTenantAdmin(tenantId, request);
    return await this.service.resolveOutstandingEntities(tenantId);
  }

  private requireTenantAdmin(tenantId: string, request: RequestWithPrincipal): void {
    const access = this.policy.resolveAccess(tenantId, resolveRequestUserId(request));
    if (!access.isAdmin) {
      throw new ForbiddenException('Tenant administrator access required');
    }
  }

  private requireTenantId(value: string | undefined, fieldName: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`${fieldName} is required`);
    }
    return value;
  }
}
