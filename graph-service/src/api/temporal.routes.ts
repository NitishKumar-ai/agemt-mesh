import { BadRequestException, Controller, Get, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { graphService } from '../services/GraphService.js';
import { Fact } from '../domain/facts.js';
import { policyEngine } from '../auth/PolicyEngine.js';
import { RequestWithPrincipal, resolveRequestUserId, resolveRequestTenantId } from '../auth/RequestIdentity.js';

@ApiTags('graph-temporal')
@Controller('api/graph/facts')
export class TemporalController {
  private readonly service = graphService;
  private readonly policy = policyEngine;

  private filterVisibleFacts(
    facts: Fact[],
    tenantId: string,
    request?: RequestWithPrincipal,
  ): Fact[] {
    const access = this.policy.resolveAccess(tenantId, resolveRequestUserId(request));
    return facts.filter((fact) => {
      if (fact.tenant_id !== tenantId) return false;
      const permissionHash = this.service.getSourcePermissionHash(tenantId, fact.source_id);
      // A missing source mapping is not public. Deny it even to admins until
      // connector ingestion has established an explicit ACL mapping.
      return permissionHash !== undefined && this.policy.isVisible(permissionHash, access);
    });
  }

  @Get('current')
  async getFactsCurrent(
    @Query('entity_id') entityId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<Fact[]> {
    const resolvedTenantId = this.requireTenantId(resolveRequestTenantId(request));
    return this.filterVisibleFacts(
      await this.service.getFactsCurrent(entityId, resolvedTenantId),
      resolvedTenantId,
      request,
    );
  }

  @Get('history')
  async getFactsHistory(
    @Query('entity_id') entityId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<Fact[]> {
    const resolvedTenantId = this.requireTenantId(resolveRequestTenantId(request));
    return this.filterVisibleFacts(
      await this.service.getFactsHistory(entityId, resolvedTenantId),
      resolvedTenantId,
      request,
    );
  }

  @Get('as-of')
  async getFactsAsOf(
    @Query('entity_id') entityId: string,
    @Query('time') timeStr: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<Fact[]> {
    const resolvedTenantId = this.requireTenantId(resolveRequestTenantId(request));
    return this.filterVisibleFacts(
      await this.service.getFactsAsOf(entityId, resolvedTenantId, timeStr),
      resolvedTenantId,
      request,
    );
  }

  @Get('changes')
  async getFactsChanges(
    @Query('entity_id') entityId: string,
    @Query('from') fromStr: string,
    @Query('to') toStr: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<Fact[]> {
    const resolvedTenantId = this.requireTenantId(resolveRequestTenantId(request));
    return this.filterVisibleFacts(
      await this.service.getFactsChanges(entityId, resolvedTenantId, fromStr, toStr),
      resolvedTenantId,
      request,
    );
  }

  @Get('conflicts')
  async getFactsConflicts(
    @Query('entity_id') entityId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<Fact[]> {
    const resolvedTenantId = this.requireTenantId(resolveRequestTenantId(request));
    return this.filterVisibleFacts(
      await this.service.getFactsConflicts(entityId, resolvedTenantId),
      resolvedTenantId,
      request,
    );
  }

  private requireTenantId(value: string | undefined): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException('tenant_id is required');
    }
    return value;
  }
}
