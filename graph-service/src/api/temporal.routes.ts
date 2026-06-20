import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { graphService } from '../services/GraphService.js';

@ApiTags('graph-temporal')
@Controller('api/graph/facts')
export class TemporalController {
  private readonly service = graphService;

  @Get('current')
  async getFactsCurrent(
    @Query('entity_id') entityId: string,
    @Query('tenant_id') tenantId?: string
  ): Promise<unknown[]> {
    return await this.service.getFactsCurrent(entityId, tenantId || 'org_123');
  }

  @Get('history')
  async getFactsHistory(
    @Query('entity_id') entityId: string,
    @Query('tenant_id') tenantId?: string
  ): Promise<unknown[]> {
    return await this.service.getFactsHistory(entityId, tenantId || 'org_123');
  }

  @Get('as-of')
  async getFactsAsOf(
    @Query('entity_id') entityId: string,
    @Query('time') timeStr: string,
    @Query('tenant_id') tenantId?: string
  ): Promise<unknown[]> {
    return await this.service.getFactsAsOf(entityId, tenantId || 'org_123', timeStr);
  }

  @Get('changes')
  async getFactsChanges(
    @Query('entity_id') entityId: string,
    @Query('from') fromStr: string,
    @Query('to') toStr: string,
    @Query('tenant_id') tenantId?: string
  ): Promise<unknown[]> {
    return await this.service.getFactsChanges(entityId, tenantId || 'org_123', fromStr, toStr);
  }

  @Get('conflicts')
  async getFactsConflicts(
    @Query('entity_id') entityId: string,
    @Query('tenant_id') tenantId?: string
  ): Promise<unknown[]> {
    return await this.service.getFactsConflicts(entityId, tenantId || 'org_123');
  }
}
