import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { graphService, CorrectionValue } from '../services/GraphService.js';

@ApiTags('corrections')
@Controller('api/correct')
export class CorrectionController {
  private readonly service = graphService;

  @Post()
  async submitCorrection(
    @Body()
    body: {
      tenant_id: string;
      user_id: string;
      answer_id?: string;
      correction_type: string;
      target_type: string;
      target_id: string;
      reason?: string;
      new_value?: CorrectionValue;
      supporting_source_ids?: string[];
    }
  ): Promise<unknown> {
    const res = await this.service.applyCorrection(body);
    return res;
  }

  @Get('audit')
  async getAuditLog(
    @Query('tenant_id') tenantId: string
  ): Promise<unknown[]> {
    return await this.service.getAuditLog(tenantId || 'org_123');
  }
}
