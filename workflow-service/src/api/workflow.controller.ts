import { BadRequestException, Controller, Post, Body, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  TrustWorkflowService,
  trustWorkflowService,
  type AnswerStreamEvent,
} from '../services/TrustWorkflowService.js';
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

  @Post('campaign-brief')
  async getCampaignBrief(
    @Body() body: { campaign: string },
    @Req() request: RequestWithPrincipal,
  ): Promise<WorkflowOutput> {
    return await this.service.generateCampaignBrief(
      this.requireTenantId(resolveRequestTenantId(request)),
      resolveRequestUserId(request),
      body,
    );
  }

  @Post('feature-brief')
  async getFeatureBrief(
    @Body() body: { feature: string },
    @Req() request: RequestWithPrincipal,
  ): Promise<WorkflowOutput> {
    return await this.service.generateFeatureBrief(
      this.requireTenantId(resolveRequestTenantId(request)),
      resolveRequestUserId(request),
      body,
    );
  }

  @Post('founder-growth-brief')
  async getFounderGrowthBrief(
    @Body() body: { campaign: string; feature?: string; channels?: string[] },
    @Req() request: RequestWithPrincipal,
  ): Promise<WorkflowOutput> {
    return await this.service.generateFounderGrowthBrief(
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

  @Post('query/stream')
  async queryAndAnswerStream(
    @Body() body: { query: string; projectId: string },
    @Req() request: RequestWithPrincipal,
    @Res() res: SseResponse,
  ): Promise<void> {
    // Resolve identity before writing any bytes so a missing tenant still
    // surfaces as a normal 400 rather than a half-open stream.
    const tenantId = this.requireTenantId(resolveRequestTenantId(request));
    const userId = resolveRequestUserId(request);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Disable proxy buffering so tokens flush as they are produced.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const abort = new AbortController();
    (request as unknown as { on?: (event: string, cb: () => void) => void }).on?.('close', () =>
      abort.abort(),
    );

    const send = (event: AnswerStreamEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      for await (const event of this.service.streamRetrieveAndAnswer(
        tenantId,
        body.query,
        body.projectId,
        userId,
        abort.signal,
      )) {
        if (abort.signal.aborted) break;
        send(event);
      }
    } catch (err) {
      if (!abort.signal.aborted) {
        const message = err instanceof Error ? err.message : 'AgentMesh could not complete the query.';
        send({ type: 'error', message });
      }
    } finally {
      res.end();
    }
  }

  private requireTenantId(value: string | undefined): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException('tenant_id is required');
    }
    return value;
  }
}

/**
 * Minimal structural view of the raw Express response used for SSE. Declared
 * locally so the controller can stream without taking an `express` type
 * dependency — the injected response satisfies this shape at runtime.
 */
interface SseResponse {
  setHeader(name: string, value: string): void;
  write(chunk: string): boolean;
  end(): void;
  flushHeaders?(): void;
}
