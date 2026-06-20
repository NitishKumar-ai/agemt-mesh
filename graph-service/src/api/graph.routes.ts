import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { graphService } from '../services/GraphService.js';
import { telemetryMetricsRegistry } from '../services/TelemetryMetricsRegistry.js';
import { GraphNode } from '../domain/entities.js';
import { GraphRelationship } from '../domain/relationships.js';
import { Fact } from '../domain/facts.js';

@ApiTags('graph')
@Controller('api/graph')
export class GraphController {
  private readonly service = graphService;

  @Get('metrics')
  async getMetrics(): Promise<unknown> {
    return telemetryMetricsRegistry.getDashboardMetrics();
  }

  @Post('nodes')
  async ingestNode(@Body() node: GraphNode): Promise<{ success: boolean }> {
    await this.service.ingestNode(node);
    return { success: true };
  }

  @Post('relationships')
  async ingestRelationship(@Body() rel: GraphRelationship): Promise<{ success: boolean }> {
    await this.service.ingestRelationship(rel);
    return { success: true };
  }

  @Post('facts')
  async ingestFact(
    @Body() fact: Fact,
    @Query('authorityMap') authorityMapStr?: string
  ): Promise<{ success: boolean }> {
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
  async runCypher(@Body() body: { query: string; params?: Record<string, unknown> }): Promise<unknown[]> {
    return await this.service.runCypher(body.query, body.params || {});
  }

  @Get('context/:projectId')
  async getProjectContext(@Param('projectId') projectId: string): Promise<unknown> {
    return await this.service.getProjectContext(projectId);
  }

  @Post('resolve')
  async resolveEntities(@Query('tenant_id') tenantId: string): Promise<{ resolvedCount: number }> {
    return await this.service.resolveOutstandingEntities(tenantId || 'org_123');
  }
}
