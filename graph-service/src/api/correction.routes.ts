import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { graphService, CorrectionValue } from '../services/GraphService.js';
import { policyEngine } from '../auth/PolicyEngine.js';
import { RequestWithPrincipal, resolveRequestUserId, resolveRequestTenantId } from '../auth/RequestIdentity.js';

@ApiTags('corrections')
@Controller('api/correct')
export class CorrectionController {
  private readonly service = graphService;
  private readonly policy = policyEngine;

  @Post()
  async submitCorrection(
    @Body()
    body: {
      tenant_id: string;
      user_id?: string;
      answer_id?: string;
      correction_type: string;
      target_type: string;
      target_id: string;
      reason?: string;
      new_value?: CorrectionValue;
      supporting_source_ids?: string[];
    },
    @Req() request: RequestWithPrincipal,
  ): Promise<unknown> {
    const tenantId = this.requireTenantId(body.tenant_id);
    const userId = this.requireTenantPolicyIdentity(tenantId, request);
    return this.service.applyCorrection({
      tenant_id: tenantId,
      user_id: userId,
      answer_id: body.answer_id,
      correction_type: body.correction_type,
      target_type: body.target_type,
      target_id: body.target_id,
      reason: body.reason,
      new_value: body.new_value,
      supporting_source_ids: body.supporting_source_ids,
    });
  }

  @Get('audit')
  async getAuditLog(
    @Req() request: RequestWithPrincipal,
  ): Promise<unknown[]> {
    const tenantId = this.requireTenantId(resolveRequestTenantId(request));
    const userId = resolveRequestUserId(request);
    const access = this.policy.resolveAccess(tenantId, userId);
    if (!userId || !access.isAdmin) {
      throw new ForbiddenException('Tenant administrator access required');
    }
    return this.service.getAuditLog(tenantId);
  }

  private requireTenantPolicyIdentity(tenantId: string, request: RequestWithPrincipal): string {
    const userId = resolveRequestUserId(request);
    if (!userId) {
      throw new ForbiddenException('Authenticated tenant identity required');
    }

    const access = this.policy.resolveAccess(tenantId, userId);
    if (!access.isAdmin && access.allowedPermissionHashes.length === 0) {
      throw new ForbiddenException('Authenticated tenant identity required');
    }
    return userId;
  }

  private requireTenantId(value: string | undefined): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException('tenant_id is required');
    }
    return value;
  }
}
