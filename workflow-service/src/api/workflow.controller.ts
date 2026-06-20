import { BadRequestException, Controller, Post, Body, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TrustWorkflowService, trustWorkflowService } from '../services/TrustWorkflowService.js';
import { WorkflowOutput } from '../domain/types.js';
import {
  RequestWithPrincipal,
  resolveRequestUserId,
  resolveRequestTenantId,
} from '@agentmesh/graph-service';

@ApiTags('workflows-trust')
@Controller('api/workflows')
export class WorkflowController {
  private readonly service = trustWorkflowService;

  @Post('onboarding-brief')
  async getOnboardingBrief(
    @Body() body: { user: string; team: string; role: string },
    @Req() request: RequestWithPrincipal,
  ): Promise<WorkflowOutput> {
    return await this.service.generateOnboardingBrief(
      this.requireTenantId(resolveRequestTenantId(request)),
      resolveRequestUserId(request),
      body,
    );
  }

  @Post('weekly-digest')
  async getWeeklyDigest(
    @Body() body: { team: string; dateRange: { from: string; to: string } },
    @Req() request: RequestWithPrincipal,
  ): Promise<WorkflowOutput> {
    return await this.service.generateWeeklyDigest(
      this.requireTenantId(resolveRequestTenantId(request)),
      resolveRequestUserId(request),
      body,
    );
  }

  @Post('incident-brief')
  async getIncidentBrief(
    @Body() body: { incidentId: string; service: string },
    @Req() request: RequestWithPrincipal,
  ): Promise<WorkflowOutput> {
    return await this.service.generateIncidentBrief(
      this.requireTenantId(resolveRequestTenantId(request)),
      resolveRequestUserId(request),
      body,
    );
  }

  @Post('meeting-prep')
  async getMeetingPrep(
    @Body() body: { eventTitle: string; attendees: string[] },
    @Req() request: RequestWithPrincipal,
  ): Promise<WorkflowOutput> {
    return await this.service.generateMeetingPrep(
      this.requireTenantId(resolveRequestTenantId(request)),
      resolveRequestUserId(request),
      body,
    );
  }

  @Post('account-summary')
  async getAccountSummary(
    @Body() body: { accountName: string },
    @Req() request: RequestWithPrincipal,
  ): Promise<WorkflowOutput> {
    return await this.service.generateAccountSummary(
      this.requireTenantId(resolveRequestTenantId(request)),
      resolveRequestUserId(request),
      body,
    );
  }

  @Post('query')
  async queryAndAnswer(
    @Body() body: { query: string; projectId: string },
    @Req() request: RequestWithPrincipal,
  ): Promise<Awaited<ReturnType<TrustWorkflowService['retrieveAndAnswer']>>> {
    const tenantId = resolveRequestTenantId(request);
    const userId = resolveRequestUserId(request);
    return await this.service.retrieveAndAnswer(
      this.requireTenantId(tenantId),
      body.query,
      body.projectId,
      userId,
    );
  }

  private requireTenantId(value: string | undefined): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException('tenant_id is required');
    }
    return value;
  }
}
