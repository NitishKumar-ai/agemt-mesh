import {
  Controller,
  Post,
  Req,
  Headers,
  UnauthorizedException,
  BadRequestException,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { WebhookService } from '../services/WebhookService.js';

/**
 * WebhookController receives inbound provider webhooks.
 *
 * Security: these endpoints are intentionally NOT protected by OidcAuthGuard.
 * External providers cannot present an OIDC token; they authenticate via an
 * HMAC signature over the raw request body, verified in WebhookService. The
 * raw body is read from req.rawBody (the Nest app is created with rawBody:true)
 * so the signature is computed over the exact bytes the provider signed.
 */
@ApiTags('webhooks')
@Controller('api/webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post('slack')
  async slack(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-slack-signature') signature?: string,
    @Headers('x-slack-request-timestamp') timestamp?: string,
  ): Promise<unknown> {
    const rawBody = req.rawBody;
    // Fail closed if the raw body is unavailable; we cannot verify the signature.
    if (!rawBody || !this.webhookService.verifySlack(rawBody, signature, timestamp)) {
      throw new UnauthorizedException('Invalid Slack signature');
    }

    const body = this.parseJson(rawBody);

    // Slack URL verification handshake: echo the challenge back.
    if (body?.type === 'url_verification') {
      return { challenge: body.challenge };
    }

    let started = 0;
    started += await this.webhookService.dispatch('webhook/slack', body);
    const eventType: string | undefined = body?.event?.type;
    if (eventType) {
      started += await this.webhookService.dispatch(`webhook/slack/${eventType}`, body);
    }

    return { ok: true, started };
  }

  @Post('github')
  async github(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature?: string,
    @Headers('x-github-event') githubEvent?: string,
  ): Promise<unknown> {
    const rawBody = req.rawBody;
    // Fail closed if the raw body is unavailable; we cannot verify the signature.
    if (!rawBody || !this.webhookService.verifyGitHub(rawBody, signature)) {
      throw new UnauthorizedException('Invalid GitHub signature');
    }

    const body = this.parseJson(rawBody);

    let started = 0;
    started += await this.webhookService.dispatch('webhook/github', body);
    if (githubEvent) {
      started += await this.webhookService.dispatch(`webhook/github/${githubEvent}`, body);
    }

    return { ok: true, started };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseJson(rawBody: Buffer): any {
    try {
      return JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid JSON payload');
    }
  }
}
