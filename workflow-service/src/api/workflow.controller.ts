import { Controller, Post, Body, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TrustWorkflowService, trustWorkflowService } from '../services/TrustWorkflowService.js';
import { WorkflowOutput } from '../domain/types.js';

@ApiTags('workflows-trust')
@Controller('api/workflows')
export class WorkflowController {
  private readonly service = trustWorkflowService;

  @Post('onboarding-brief')
  async getOnboardingBrief(
    @Body() body: { user: string; team: string; role: string },
    @Query('tenant_id') tenantId?: string,
    @Query('user_id') userId?: string
  ): Promise<WorkflowOutput> {
    return await this.service.generateOnboardingBrief(
      tenantId || 'org_123',
      userId || 'user_456',
      body
    );
  }

  @Post('weekly-digest')
  async getWeeklyDigest(
    @Body() body: { team: string; dateRange: { from: string; to: string } },
    @Query('tenant_id') tenantId?: string,
    @Query('user_id') userId?: string
  ): Promise<WorkflowOutput> {
    return await this.service.generateWeeklyDigest(
      tenantId || 'org_123',
      userId || 'user_456',
      body
    );
  }

  @Post('incident-brief')
  async getIncidentBrief(
    @Body() body: { incidentId: string; service: string },
    @Query('tenant_id') tenantId?: string,
    @Query('user_id') userId?: string
  ): Promise<WorkflowOutput> {
    return await this.service.generateIncidentBrief(
      tenantId || 'org_123',
      userId || 'user_456',
      body
    );
  }

  @Post('meeting-prep')
  async getMeetingPrep(
    @Body() body: { eventTitle: string; attendees: string[] },
    @Query('tenant_id') tenantId?: string,
    @Query('user_id') userId?: string
  ): Promise<WorkflowOutput> {
    return await this.service.generateMeetingPrep(
      tenantId || 'org_123',
      userId || 'user_456',
      body
    );
  }

  @Post('account-summary')
  async getAccountSummary(
    @Body() body: { accountName: string },
    @Query('tenant_id') tenantId?: string,
    @Query('user_id') userId?: string
  ): Promise<WorkflowOutput> {
    return await this.service.generateAccountSummary(
      tenantId || 'org_123',
      userId || 'user_456',
      body
    );
  }

  @Post('query')
  async queryAndAnswer(
    @Body() body: { query: string; projectId: string },
    @Query('tenant_id') tenantId?: string
  ): Promise<any> {
    return await this.service.retrieveAndAnswer(
      tenantId || 'org_123',
      body.query,
      body.projectId
    );
  }
}
