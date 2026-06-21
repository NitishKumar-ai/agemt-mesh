import { Controller, Get, Delete, Query, Redirect, Param, Res, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import axios from 'axios';
import { ConnectorStatus } from '@scalekit-sdk/node/lib/pkg/grpc/scalekit/v1/connected_accounts/connected_accounts_pb.js';
import { CONNECTION_SERVICE, ConnectionService } from '../services/ConnectionService.js';

/**
 * Social Studio OAuth Controller
 *
 * Handles OAuth 2.0 authorization and callbacks for social platforms.
 * Connected account state is persisted in SQLite via ConnectionService.
 */
@Controller('api/social-studio')
export class SocialOAuthController {
  constructor(
    @Inject(CONNECTION_SERVICE) private readonly connections: ConnectionService,
  ) {}

  private getBaseUrl(req: any): string {
    const host = req?.headers?.host ?? 'localhost:8080';
    const proto = req?.headers?.['x-forwarded-proto'] ?? 'http';
    return `${proto}://${host}`;
  }

  private getReturnUrl(state: string | undefined, platform: string): string {
    if (state && state.startsWith('return:')) {
      try {
        const encoded = state.slice('return:'.length);
        const url = Buffer.from(encoded, 'base64url').toString('utf8');
        if (URL.canParse(url)) {
          const parsed = new URL(url);
          parsed.searchParams.set('connected', platform);
          return parsed.toString();
        }
      } catch {
        /* fall back to default */
      }
    }
    const base = process.env.PUBLIC_URL || 'http://localhost:5173';
    return `${base}/admin/sources?connected=${encodeURIComponent(platform)}`;
  }

  private renderSuccessHtml(platform: string, state?: string): string {
    const returnUrl = this.getReturnUrl(state, platform);
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Connected Successfully</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0a0a0a; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #111; padding: 40px; border-radius: 20px; border: 1px solid #222; text-align: center; max-width: 400px; box-shadow: 0 20px 40px rgba(0,0,0,0.4); animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
            .icon { width: 64px; height: 64px; background: #22c55e; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; box-shadow: 0 0 20px rgba(34, 197, 94, 0.3); }
            h1 { margin: 0 0 12px; font-size: 24px; font-weight: 600; letter-spacing: -0.5px; }
            p { color: #888; margin: 0 0 32px; font-size: 15px; line-height: 1.5; }
            a { display: inline-block; background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: white; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 600; transition: all 0.2s; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3); }
            a:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(59, 130, 246, 0.4); }
            @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          </style>
          <script>setTimeout(() => window.location.href = '${returnUrl.replace(/'/g, "\\'")}', 3000);</script>
        </head>
        <body>
          <div class="card">
            <div class="icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <h1>${platform.charAt(0).toUpperCase() + platform.slice(1)} Connected</h1>
            <p>Your account has been successfully linked to AgentMesh. Redirecting you back to Sources...</p>
            <a href="${returnUrl.replace(/"/g, '&quot;')}">Return to Sources</a>
          </div>
        </body>
      </html>
    `;
  }

  @Get('oauth/linkedin/login')
  @Redirect()
  startLinkedIn(@Query('state') state = 'linkedin-auth') {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    if (!clientId) throw new HttpException('LINKEDIN_CLIENT_ID not configured', HttpStatus.SERVICE_UNAVAILABLE);
    const port = process.env.PORT?.trim() ?? 8080;
    const baseUrl = `http://localhost:${port}`;
    const redirectUri = `${baseUrl}/api/social-studio/oauth/linkedin/callback`;
    const scopes = 'openid profile w_member_social email';
    const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${encodeURIComponent(scopes)}`;
    return { url };
  }

  @Get('oauth/linkedin/callback')
  async linkedInCallback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (error) {
      return res.status(400).json({ error, message: 'LinkedIn OAuth denied' });
    }
    if (!code) {
      return res.status(400).json({ error: 'No code received from LinkedIn' });
    }
    try {
      const clientId = process.env.LINKEDIN_CLIENT_ID!;
      const clientSecret = process.env.LINKEDIN_CLIENT_SECRET!;
      const port = process.env.PORT?.trim() ?? 8080;
      const baseUrl = `http://localhost:${port}`;
      const redirectUri = `${baseUrl}/api/social-studio/oauth/linkedin/callback`;

      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      });

      const { data } = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      let metadata: Record<string, unknown> | undefined;
      try {
        const { data: profile } = await axios.get('https://api.linkedin.com/v2/userinfo', {
          headers: {
            Authorization: `Bearer ${data.access_token}`,
            'LinkedIn-Version': '202604',
            'X-Restli-Protocol-Version': '2.0.0',
          },
        });
        metadata = {
          name: profile.name || `${profile.given_name || ''} ${profile.family_name || ''}`.trim() || 'LinkedIn User',
          urn: `urn:li:person:${profile.sub}`,
          avatarUrl: profile.picture,
        };
      } catch (err: any) {
        console.error('Failed to fetch LinkedIn profile', err?.message);
      }

      await this.connections.upsertSocialToken('linkedin', {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + (data.expires_in ?? 5184000) * 1000,
        metadata,
      });

      return res.send(this.renderSuccessHtml('linkedin', state));
    } catch (err: any) {
      return res.status(500).json({ error: 'Token exchange failed', detail: err?.response?.data ?? err.message });
    }
  }

  @Get('oauth/threads/login')
  @Redirect()
  startThreads(@Query('state') state = 'threads-auth') {
    const appId = process.env.THREADS_APP_ID;
    if (!appId) throw new HttpException('THREADS_APP_ID not configured', HttpStatus.SERVICE_UNAVAILABLE);
    const port = process.env.PORT?.trim() ?? 8080;
    const baseUrl = process.env.PUBLIC_URL || `http://localhost:${port}`;
    const redirectUri = `${baseUrl}/api/social-studio/oauth/threads/callback`;
    const scopes = 'threads_basic,threads_content_publish,threads_manage_replies,threads_manage_insights';
    const url = `https://www.threads.net/oauth/authorize?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${state}`;
    return { url };
  }

  @Get('oauth/threads/callback')
  async threadsCallback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (error) {
      return res.status(400).json({ error, message: 'Threads OAuth denied' });
    }
    if (!code) {
      return res.status(400).json({ error: 'No code received from Threads' });
    }
    try {
      const appId = process.env.THREADS_APP_ID!;
      const appSecret = process.env.THREADS_APP_SECRET!;
      const port = process.env.PORT?.trim() ?? 8080;
      const baseUrl = process.env.PUBLIC_URL || `http://localhost:${port}`;
      const redirectUri = `${baseUrl}/api/social-studio/oauth/threads/callback`;

      const params = new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      });
      const { data: shortData } = await axios.post('https://graph.threads.net/oauth/access_token', params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const { data: longData } = await axios.get('https://graph.threads.net/v1.0/access_token', {
        params: {
          grant_type: 'th_exchange_token',
          client_secret: appSecret,
          access_token: shortData.access_token,
        },
      });

      let metadata: Record<string, unknown> | undefined;
      try {
        const { data: profile } = await axios.get('https://graph.threads.net/v1.0/me', {
          params: {
            fields: 'id,username,name',
            access_token: longData.access_token ?? shortData.access_token,
          },
        });
        metadata = {
          name: profile.name || profile.username || 'Threads User',
          urn: profile.id,
        };
      } catch (err: any) {
        console.error('Failed to fetch Threads profile', err?.message);
      }

      await this.connections.upsertSocialToken('threads', {
        accessToken: longData.access_token ?? shortData.access_token,
        expiresAt: Date.now() + (longData.expires_in ?? 5184000) * 1000,
        metadata,
      });

      return res.send(this.renderSuccessHtml('threads', state));
    } catch (err: any) {
      return res.status(500).json({ error: 'Token exchange failed', detail: err?.response?.data ?? err.message });
    }
  }

  @Get('oauth/scalekit/:provider/login')
  @Redirect()
  async startScalekitAuth(
    @Param('provider') provider: string,
    @Query('identifier') identifier?: string,
    @Query('state') state?: string,
  ) {
    const envUrl = process.env.SCALEKIT_ENVIRONMENT_URL;
    const clientId = process.env.SCALEKIT_CLIENT_ID;
    const clientSecret = process.env.SCALEKIT_CLIENT_SECRET;

    if (!envUrl || !clientId || !clientSecret) {
      throw new HttpException('Scalekit credentials not configured', HttpStatus.SERVICE_UNAVAILABLE);
    }

    const { ScalekitClient } = await import('@scalekit-sdk/node');
    const scalekit = new ScalekitClient(envUrl, clientId, clientSecret);

    if (provider === 'scalekit') {
      let orgId = process.env.SCALEKIT_ORGANIZATION_ID;
      if (!orgId) {
        try {
          const listResult = await scalekit.organization.listOrganization({});
          const orgs: any[] = (listResult as any).organizations ?? (listResult as any).data ?? [];
          if (orgs.length > 0) {
            orgId = orgs[0].id;
          }
        } catch (err: any) {
          console.error('Scalekit listOrganization error:', err);
        }
      }
      if (!orgId) {
        throw new HttpException(
          'No Scalekit organization found. Set SCALEKIT_ORGANIZATION_ID in your .env or create an organization in your Scalekit dashboard.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      const portalLinkResponse = await scalekit.organization.generatePortalLink(orgId);
      let url: string | undefined;
      if (typeof portalLinkResponse === 'string') {
        url = portalLinkResponse;
      } else if (portalLinkResponse && typeof portalLinkResponse === 'object') {
        const res = portalLinkResponse as any;
        url =
          res.location ||
          res.link ||
          res.url ||
          res.portalLink ||
          (res.data && (res.data.location || res.data.link || res.data.url || res.data.portalLink));
      }
      if (!url) {
        throw new HttpException(
          'Scalekit returned an empty portal link. Check your Scalekit dashboard configuration.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      return { url };
    }

    const connectionName = this.connections.getScalekitConnectionName(provider);
    const targetIdentifier = identifier || this.connections.defaultScalekitIdentifier();
    const port = process.env.PORT?.trim() ?? 8080;
    const baseUrl = `http://localhost:${port}`;

    try {
      const accountResponse = await scalekit.actions.getOrCreateConnectedAccount({
        connectionName,
        identifier: targetIdentifier,
      });
      const connectedAccount = accountResponse.connectedAccount;

      if (connectedAccount?.status !== ConnectorStatus.ACTIVE) {
        const linkResponse = await scalekit.actions.getAuthorizationLink({
          connectionName,
          identifier: targetIdentifier,
          userVerifyUrl: `${baseUrl}/api/social-studio/status?provider=${encodeURIComponent(provider)}&state=${encodeURIComponent(state || '')}`,
        });
        return { url: linkResponse.link };
      }

      await this.connections.syncScalekitAccounts();
      const returnUrl = this.getReturnUrl(state, provider);
      return { url: returnUrl };
    } catch (err: any) {
      console.error('Scalekit getAuthorizationLink error:', err);
      throw new HttpException('Failed to get Scalekit authorization link', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('oauth/facebook/login')
  @Redirect()
  startFacebook(@Query('state') state = 'facebook-auth') {
    const appId = process.env.FACEBOOK_APP_ID;
    if (!appId) throw new HttpException('FACEBOOK_APP_ID not configured', HttpStatus.SERVICE_UNAVAILABLE);
    const baseUrl = `http://localhost:${process.env.PORT ?? 8080}`;
    const redirectUri = `${baseUrl}/api/social-studio/oauth/facebook/callback`;
    const scopes = 'pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_metadata,pages_messaging';
    const url = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${state}`;
    return { url };
  }

  @Get('oauth/facebook/callback')
  async facebookCallback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (error) {
      return res.status(400).json({ error, message: 'Facebook OAuth denied' });
    }
    if (!code) {
      return res.status(400).json({ error: 'No code received from Facebook' });
    }
    try {
      const appId = process.env.FACEBOOK_APP_ID!;
      const appSecret = process.env.FACEBOOK_APP_SECRET!;
      const baseUrl = `http://localhost:${process.env.PORT ?? 8080}`;
      const redirectUri = `${baseUrl}/api/social-studio/oauth/facebook/callback`;

      const { data } = await axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
        params: { client_id: appId, redirect_uri: redirectUri, client_secret: appSecret, code },
      });

      let fbMetadata: Record<string, unknown> | undefined;
      try {
        const { data: profile } = await axios.get('https://graph.facebook.com/v21.0/me', {
          params: { fields: 'id,name,picture', access_token: data.access_token },
        });
        fbMetadata = {
          name: profile.name || 'Facebook User',
          urn: profile.id,
          avatarUrl: profile.picture?.data?.url,
        };
      } catch (err: any) {
        console.error('Failed to fetch Facebook profile', err?.message);
      }

      const tokenPayload = {
        accessToken: data.access_token,
        expiresAt: Date.now() + (data.expires_in ?? 5184000) * 1000,
        metadata: fbMetadata,
      };
      await this.connections.upsertSocialToken('facebook', tokenPayload);
      await this.connections.upsertSocialToken('instagram', tokenPayload);

      return res.send(this.renderSuccessHtml('facebook', state));
    } catch (err: any) {
      return res.status(500).json({ error: 'Token exchange failed', detail: err?.response?.data ?? err.message });
    }
  }

  @Get('oauth/instagram/login')
  @Redirect()
  startInstagram(@Query('state') state = 'instagram-auth') {
    const appId = process.env.INSTAGRAM_APP_ID;
    if (!appId) throw new HttpException('INSTAGRAM_APP_ID not configured', HttpStatus.SERVICE_UNAVAILABLE);
    const port = process.env.PORT?.trim() ?? 8080;
    const baseUrl = process.env.PUBLIC_URL || `http://localhost:${port}`;
    const redirectUri = `${baseUrl}/api/social-studio/oauth/instagram/callback`;
    const scopes = 'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments,instagram_business_manage_messages';
    const url = `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${state}`;
    return { url };
  }

  @Get('oauth/instagram/callback')
  async instagramCallback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (error) {
      return res.status(400).json({ error, message: 'Instagram OAuth denied' });
    }
    if (!code) {
      return res.status(400).json({ error: 'No code received from Instagram' });
    }
    try {
      const appId = process.env.INSTAGRAM_APP_ID!;
      const appSecret = process.env.INSTAGRAM_APP_SECRET!;
      const port = process.env.PORT?.trim() ?? 8080;
      const baseUrl = process.env.PUBLIC_URL || `http://localhost:${port}`;
      const redirectUri = `${baseUrl}/api/social-studio/oauth/instagram/callback`;

      const params = new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      });

      const { data: shortData } = await axios.post('https://api.instagram.com/oauth/access_token', params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const { data: longData } = await axios.get('https://graph.instagram.com/access_token', {
        params: {
          grant_type: 'ig_exchange_token',
          client_secret: appSecret,
          access_token: shortData.access_token,
        },
      });

      let metadata: Record<string, unknown> | undefined;
      try {
        const { data: profile } = await axios.get('https://graph.instagram.com/me', {
          params: { fields: 'id,username', access_token: longData.access_token ?? shortData.access_token },
        });
        metadata = {
          name: profile.username || 'Instagram User',
          urn: profile.id,
        };
      } catch (err: any) {
        console.error('Failed to fetch Instagram profile', err?.message);
      }

      await this.connections.upsertSocialToken('instagram', {
        accessToken: longData.access_token ?? shortData.access_token,
        expiresAt: Date.now() + (longData.expires_in ?? 5184000) * 1000,
        metadata,
      });

      return res.send(this.renderSuccessHtml('instagram', state));
    } catch (err: any) {
      return res.status(500).json({ error: 'Token exchange failed', detail: err?.response?.data ?? err.message });
    }
  }

  @Get('token/:platform')
  async getToken(@Param('platform') platform: string) {
    const entry = await this.connections.getSocialToken(platform);
    if (!entry) {
      throw new HttpException(`No token stored for platform: ${platform}. Complete OAuth first.`, HttpStatus.NOT_FOUND);
    }
    const expiresAt = typeof entry.config.expiresAt === 'number' ? entry.config.expiresAt : undefined;
    const isExpired = typeof expiresAt === 'number' && Date.now() > expiresAt;
    return {
      platform,
      accessToken: entry.config.accessToken,
      hasRefreshToken: !!entry.config.refreshToken,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      expired: !!isExpired,
    };
  }

  @Get('status')
  async getStatus(
    @Query('provider') provider: string | undefined,
    @Query('state') state: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.connections.syncScalekitAccounts();

    if (provider) {
      const returnUrl = this.getReturnUrl(state, provider);
      res.redirect(returnUrl);
      return;
    }

    return {
      platforms: await this.connections.getSocialStatus(),
    };
  }

  @Delete('token/:platform')
  async disconnectToken(@Param('platform') platform: string) {
    const disconnected = await this.connections.removeSocialToken(platform);
    return { ok: true, platform, disconnected };
  }

  @Get('oauth/scalekit/accounts')
  async listScalekitAccounts() {
    await this.connections.syncScalekitAccounts();
    const connections = (await this.connections.listConnections()).filter(
      (conn) => conn.connector_type === 'scalekit',
    );
    return { connections };
  }
}
