/**
 * HTTP endpoint for Growth Memory "bring your own data" ingestion.
 *
 * POST /api/growth/ingest accepts a founder's campaign/channel/feature/feedback
 * dataset and writes it into the graph using the same conventions the existing
 * founder-growth brief reads. Identity is taken ONLY from the verified
 * request.user principal (mirrors WorkflowController); tenant/user are never read
 * from the request body.
 */
import { BadRequestException, Controller, Post, Body, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  RequestWithPrincipal,
  resolveRequestTenantId,
  resolveRequestUserId,
} from '@agentmesh/graph-service';
import {
  growthIngestService,
  type GrowthIngestRequest,
  type GrowthIngestResult,
} from '../services/GrowthIngestService.js';

@ApiTags('growth-ingest')
@Controller('api/growth')
export class GrowthIngestController {
  private readonly service = growthIngestService;

  @Post('ingest')
  async ingest(
    @Body() body: GrowthIngestRequest,
    @Req() request: RequestWithPrincipal,
  ): Promise<GrowthIngestResult> {
    // Resolve identity from verified request.user only; never trust the body.
    const tenantId = this.requireTenantId(resolveRequestTenantId(request));
    const userId = resolveRequestUserId(request);

    if (!body || typeof body !== 'object') {
      throw new BadRequestException('request body is required');
    }
    if (!body.campaign || typeof body.campaign.name !== 'string' || body.campaign.name.trim().length === 0) {
      throw new BadRequestException('campaign.name is required');
    }
    if (!Array.isArray(body.channels)) {
      throw new BadRequestException('channels must be an array');
    }

    return await this.service.ingest(tenantId, userId, body);
  }

  private requireTenantId(value: string | undefined): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException('tenant_id is required');
    }
    return value;
  }
}
