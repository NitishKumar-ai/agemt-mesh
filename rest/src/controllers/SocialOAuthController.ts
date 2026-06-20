import { Controller, Get, Query, Redirect, Param, Res, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import axios from 'axios';
import { ConnectorStatus } from '@scalekit-sdk/node/lib/pkg/grpc/scalekit/v1/connected_accounts/connected_accounts_pb.js';

const TOKEN_STORE: Map<string, { accessToken: string; refreshToken?: string; expiresAt?: number }> = new Map();

/**
 * Social Studio OAuth Controller
 *
 * Handles OAuth 2.0 authorization and callbacks for social platforms.
 * Endpoints:
 *   GET /api/social-studio/oauth/:platform         - Start OAuth flow (redirects to platform)
 *   GET /api/social-studio/oauth/:platform/callback - Handle OAuth callback
 *   GET /api/social-studio/token/:platform          - Retrieve stored access token
 */
@Controller('api/social-studio')
export class SocialOAuthController {
  private getBaseUrl(req: any): string {
    const host = req?.headers?.host ?? 'localhost:8080';
    const proto = req?.headers?.['x-forwarded-proto'] ?? 'http';
    return `${proto}://${host}`;
  }

  private renderSuccessHtml(platform: string): string {
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
          <script>setTimeout(() => window.location.href = '/', 3000);</script>
        </head>
        <body>
          <div class="card">
            <div class="icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <h1>${platform.charAt(0).toUpperCase() + platform.slice(1)} Connected</h1>
            <p>Your account has been successfully linked to AgentMesh. Redirecting you back to the dashboard...</p>
            <a href="/">Return to Dashboard</a>
          </div>
        </body>
      </html>
    `;
  }


  // ---------------------------------------------------------------------------
  // LinkedIn
  // ---------------------------------------------------------------------------

  @Get('oauth/linkedin/login')
  @Redirect()
  startLinkedIn(@Query('state') state = 'linkedin-auth') {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    if (!clientId) throw new HttpException('LINKEDIN_CLIENT_ID not configured', HttpStatus.SERVICE_UNAVAILABLE);
    const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT ?? 8080}`;
    const redirectUri = `${baseUrl}/api/social-studio/oauth/linkedin/callback`;
    // Use the exact scopes shown in the user's LinkedIn portal screenshot
    const scopes = 'openid profile w_member_social email';
    const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${encodeURIComponent(scopes)}`;
    return { url };
  }

  @Get('oauth/linkedin/callback')
  async linkedInCallback(@Query('code') code: string, @Query('error') error: string, @Res() res: Response) {
    if (error) {
      return res.status(400).json({ error, message: 'LinkedIn OAuth denied' });
    }
    if (!code) {
      return res.status(400).json({ error: 'No code received from LinkedIn' });
    }
    try {
      const clientId = process.env.LINKEDIN_CLIENT_ID!;
      const clientSecret = process.env.LINKEDIN_CLIENT_SECRET!;
      const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT ?? 8080}`;
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

      TOKEN_STORE.set('linkedin', {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + (data.expires_in ?? 5184000) * 1000,
      });

      return res.send(this.renderSuccessHtml('linkedin'));
    } catch (err: any) {
      return res.status(500).json({ error: 'Token exchange failed', detail: err?.response?.data ?? err.message });
    }
  }

  // ---------------------------------------------------------------------------
  // Threads
  // ---------------------------------------------------------------------------

  @Get('oauth/threads/login')
  @Redirect()
  startThreads(@Query('state') state = 'threads-auth') {
    const appId = process.env.THREADS_APP_ID;
    if (!appId) throw new HttpException('THREADS_APP_ID not configured', HttpStatus.SERVICE_UNAVAILABLE);
    const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT ?? 8080}`;
    const redirectUri = `${baseUrl}/api/social-studio/oauth/threads/callback`;
    const scopes = 'threads_basic,threads_content_publish,threads_manage_replies,threads_manage_insights';
    const url = `https://www.threads.net/oauth/authorize?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${state}`;
    return { url };
  }

  @Get('oauth/threads/callback')
  async threadsCallback(@Query('code') code: string, @Query('error') error: string, @Res() res: Response) {
    if (error) {
      return res.status(400).json({ error, message: 'Threads OAuth denied' });
    }
    if (!code) {
      return res.status(400).json({ error: 'No code received from Threads' });
    }
    try {
      const appId = process.env.THREADS_APP_ID!;
      const appSecret = process.env.THREADS_APP_SECRET!;
      const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT ?? 8080}`;
      const redirectUri = `${baseUrl}/api/social-studio/oauth/threads/callback`;

      // Step 1: Exchange code for short-lived token
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

      // Step 2: Exchange for long-lived token
      const { data: longData } = await axios.get('https://graph.threads.net/v1.0/access_token', {
        params: {
          grant_type: 'th_exchange_token',
          client_secret: appSecret,
          access_token: shortData.access_token,
        },
      });

      TOKEN_STORE.set('threads', {
        accessToken: longData.access_token ?? shortData.access_token,
        expiresAt: Date.now() + (longData.expires_in ?? 5184000) * 1000,
      });

      return res.send(this.renderSuccessHtml('threads'));
    } catch (err: any) {
      return res.status(500).json({ error: 'Token exchange failed', detail: err?.response?.data ?? err.message });
    }
  }

  // ---------------------------------------------------------------------------
  // ScaleKit Auth
  // ---------------------------------------------------------------------------

  @Get('oauth/scalekit/:provider/login')
  @Redirect()
  async startScalekitAuth(@Param('provider') provider: string, @Query('identifier') identifier = 'default-user') {
    const envUrl = process.env.SCALEKIT_ENVIRONMENT_URL;
    const clientId = process.env.SCALEKIT_CLIENT_ID;
    const clientSecret = process.env.SCALEKIT_CLIENT_SECRET;

    console.log(`[Scalekit] provider=${provider}, envUrl=${envUrl ? 'SET' : 'MISSING'}, clientId=${clientId ? 'SET' : 'MISSING'}, clientSecret=${clientSecret ? 'SET' : 'MISSING'}, orgId=${process.env.SCALEKIT_ORGANIZATION_ID ?? 'MISSING'}`);

    if (!envUrl || !clientId || !clientSecret) {
      throw new HttpException('Scalekit credentials not configured', HttpStatus.SERVICE_UNAVAILABLE);
    }

    // Dynamically import to avoid missing dependencies if the SDK isn't fully installed yet during compilation
    const { ScalekitClient } = await import('@scalekit-sdk/node');
    const scalekit = new ScalekitClient(envUrl, clientId, clientSecret);

    if (provider === 'scalekit') {
      let orgId = process.env.SCALEKIT_ORGANIZATION_ID;
      if (!orgId) {
        // Auto-discover the first organization if no explicit org ID is configured
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
          HttpStatus.SERVICE_UNAVAILABLE
        );
      }
      try {
        const portalLinkResponse = await scalekit.organization.generatePortalLink(orgId);
        try {
          console.log('Scalekit generatePortalLink response:', JSON.stringify(portalLinkResponse, (_key, value) =>
            typeof value === 'bigint' ? value.toString() : value, 2));
        } catch (logErr) {
          // If logging fails for any reason, log what we can and continue
          console.log('Scalekit generatePortalLink response (raw):', portalLinkResponse);
        }
        // The SDK may return a string, or an object with .link, .url, .portalLink, .location, or nested under .data
        let url: string | undefined;
        if (typeof portalLinkResponse === 'string') {
          url = portalLinkResponse;
        } else if (portalLinkResponse && typeof portalLinkResponse === 'object') {
          const res = portalLinkResponse as any;
          url = res.location || res.link || res.url || res.portalLink ||
                (res.data && (res.data.location || res.data.link || res.data.url || res.data.portalLink));
        }

        if (!url) {
          console.error('Scalekit generatePortalLink returned no usable URL. Full response:', portalLinkResponse);
          throw new HttpException(
            'Scalekit returned an empty portal link. Check your Scalekit dashboard configuration.',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
        return { url };
      } catch (err: any) {
        if (err instanceof HttpException) throw err;
        console.error('Scalekit generatePortalLink error:', err);
        throw new HttpException('Failed to generate Scalekit portal link', HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }

    try {
      // Map generic names to the actual Scalekit connection IDs
      let connectionName = provider;
      let targetIdentifier = identifier;

      if (provider === 'slack') {
        connectionName = 'slack-SudvXvwi';
      }
      if (provider === 'airtable') {
        connectionName = 'airtable-QvhprOUU';
        targetIdentifier = 'shreeharshastark@gmail.com';
      }

      // 1. Create or retrieve the connected account for this user
      const accountResponse = await scalekit.actions.getOrCreateConnectedAccount({
        connectionName: connectionName,
        identifier: targetIdentifier,
      });
      const connectedAccount = accountResponse.connectedAccount;

      // 2. Generate the authorization link if the account is not yet active
      // In @scalekit-sdk/node, ConnectorStatus.ACTIVE usually maps to a specific enum or string, but typically it's just 'ACTIVE'
      if (connectedAccount?.status !== ConnectorStatus.ACTIVE) {
        const baseUrl = `http://localhost:${process.env.PORT ?? 8080}`;
        const linkResponse = await scalekit.actions.getAuthorizationLink({
          connectionName: connectionName,
          identifier: targetIdentifier,
          userVerifyUrl: `${baseUrl}/api/social-studio/status`,
        });
        return { url: linkResponse.link };
      } else {
        // If it's already active, we shouldn't redirect to auth again. 
        // We can just redirect back to the app with a success state.
        const baseUrl = `http://localhost:${process.env.PORT ?? 8080}`;
        return { url: `${baseUrl}/api/social-studio/status?status=already_active&provider=${provider}` };
      }
    } catch (err: any) {
      console.error('Scalekit getAuthorizationLink error:', err);
      // Log the full error details if available from the SDK
      if (err._unpackedDetails || err.details) {
        console.error('Scalekit error details:', JSON.stringify(err._unpackedDetails || err.details, null, 2));
      }
      throw new HttpException('Failed to get Scalekit authorization link', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ---------------------------------------------------------------------------
  // Facebook
  // ---------------------------------------------------------------------------

  @Get('oauth/facebook/login')
  @Redirect()
  startFacebook(@Query('state') state = 'facebook-auth') {
    const appId = process.env.FACEBOOK_APP_ID;
    if (!appId) throw new HttpException('FACEBOOK_APP_ID not configured', HttpStatus.SERVICE_UNAVAILABLE);
    // User requested specifically to use localhost for Facebook to avoid App Domain errors
    const baseUrl = `http://localhost:${process.env.PORT ?? 8080}`;
    const redirectUri = `${baseUrl}/api/social-studio/oauth/facebook/callback`;
    const scopes = 'pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_metadata,pages_messaging';
    const url = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${state}`;
    return { url };
  }

  @Get('oauth/facebook/callback')
  async facebookCallback(@Query('code') code: string, @Query('error') error: string, @Res() res: Response) {
    if (error) {
      return res.status(400).json({ error, message: 'Facebook OAuth denied' });
    }
    if (!code) {
      return res.status(400).json({ error: 'No code received from Facebook' });
    }
    try {
      const appId = process.env.FACEBOOK_APP_ID!;
      const appSecret = process.env.FACEBOOK_APP_SECRET!;
      // Force localhost as requested
      const baseUrl = `http://localhost:${process.env.PORT ?? 8080}`;
      const redirectUri = `${baseUrl}/api/social-studio/oauth/facebook/callback`;

      const { data } = await axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
        params: { client_id: appId, redirect_uri: redirectUri, client_secret: appSecret, code },
      });

      TOKEN_STORE.set('facebook', {
        accessToken: data.access_token,
        expiresAt: Date.now() + (data.expires_in ?? 5184000) * 1000,
      });
      TOKEN_STORE.set('instagram', {
        accessToken: data.access_token, // Same token used for Instagram via Graph API
        expiresAt: Date.now() + (data.expires_in ?? 5184000) * 1000,
      });

      return res.json({
        platform: 'facebook',
        status: 'connected',
        message: 'Facebook (and Instagram) connected successfully',
        expiresIn: data.expires_in,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Token exchange failed', detail: err?.response?.data ?? err.message });
    }
  }

  // ---------------------------------------------------------------------------
  // Instagram
  // ---------------------------------------------------------------------------

  @Get('oauth/instagram/login')
  @Redirect()
  startInstagram(@Query('state') state = 'instagram-auth') {
    const appId = process.env.INSTAGRAM_APP_ID;
    if (!appId) throw new HttpException('INSTAGRAM_APP_ID not configured', HttpStatus.SERVICE_UNAVAILABLE);
    const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT ?? 8080}`;
    const redirectUri = `${baseUrl}/api/social-studio/oauth/instagram/callback`;
    const scopes = 'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments,instagram_business_manage_messages';
    const url = `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${state}`;
    return { url };
  }

  @Get('oauth/instagram/callback')
  async instagramCallback(@Query('code') code: string, @Query('error') error: string, @Res() res: Response) {
    if (error) {
      return res.status(400).json({ error, message: 'Instagram OAuth denied' });
    }
    if (!code) {
      return res.status(400).json({ error: 'No code received from Instagram' });
    }
    try {
      const appId = process.env.INSTAGRAM_APP_ID!;
      const appSecret = process.env.INSTAGRAM_APP_SECRET!;
      const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT ?? 8080}`;
      const redirectUri = `${baseUrl}/api/social-studio/oauth/instagram/callback`;

      // 1. Get short-lived token
      const params = new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      });

      // Instagram access_token expects url-encoded body, not query params
      const { data: shortData } = await axios.post('https://api.instagram.com/oauth/access_token', params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      // 2. Exchange for long-lived token
      const { data: longData } = await axios.get('https://graph.instagram.com/access_token', {
        params: {
          grant_type: 'ig_exchange_token',
          client_secret: appSecret,
          access_token: shortData.access_token,
        },
      });

      TOKEN_STORE.set('instagram', {
        accessToken: longData.access_token ?? shortData.access_token,
        expiresAt: Date.now() + (longData.expires_in ?? 5184000) * 1000,
      });

      return res.send(this.renderSuccessHtml('instagram'));
    } catch (err: any) {
      return res.status(500).json({ error: 'Token exchange failed', detail: err?.response?.data ?? err.message });
    }
  }

  // ---------------------------------------------------------------------------
  // Token retrieval (for connectors to call at runtime)
  // ---------------------------------------------------------------------------

  @Get('token/:platform')
  getToken(@Param('platform') platform: string) {
    const entry = TOKEN_STORE.get(platform);
    if (!entry) {
      throw new HttpException(`No token stored for platform: ${platform}. Complete OAuth first.`, HttpStatus.NOT_FOUND);
    }
    const isExpired = entry.expiresAt && Date.now() > entry.expiresAt;
    return {
      platform,
      accessToken: entry.accessToken,
      hasRefreshToken: !!entry.refreshToken,
      expiresAt: entry.expiresAt ? new Date(entry.expiresAt).toISOString() : null,
      expired: !!isExpired,
    };
  }

  @Get('status')
  getStatus() {
    const platforms = ['linkedin', 'threads', 'facebook', 'instagram'];
    return {
      platforms: Object.fromEntries(
        platforms.map((p) => {
          const entry = TOKEN_STORE.get(p);
          return [p, entry
            ? { connected: true, expired: !!(entry.expiresAt && Date.now() > entry.expiresAt) }
            : { connected: false }
          ];
        })
      ),
    };
  }

  @Get('oauth/scalekit/accounts')
  async listScalekitAccounts() {
    const envUrl = process.env.SCALEKIT_ENVIRONMENT_URL;
    const clientId = process.env.SCALEKIT_CLIENT_ID;
    const clientSecret = process.env.SCALEKIT_CLIENT_SECRET;
    const orgId = process.env.SCALEKIT_ORGANIZATION_ID;

    if (!envUrl || !clientId || !clientSecret || !orgId) {
      return { connections: [] };
    }

    try {
      const { ScalekitClient } = await import('@scalekit-sdk/node');
      const scalekit = new ScalekitClient(envUrl, clientId, clientSecret);
      
      const accountsRes = await scalekit.actions.listConnectedAccounts({ organizationId: orgId });
      // Filter for accounts with status 3 (ACTIVE) and map to a UI-friendly format
      const connections = (accountsRes.connectedAccounts || []).filter(a => a.status === 3).map((acc) => {
        // Reverse map the connector name back to the UI provider id
        let providerId = acc.connector;
        if (acc.connector === 'slack-SudvXvwi') providerId = 'slack';
        if (acc.connector === 'airtable-QvhprOUU') providerId = 'airtable';
        
        return {
          id: acc.id,
          provider_id: providerId,
          status: 'connected',
          created_at: acc.updatedAt?.seconds ? new Date(Number(acc.updatedAt.seconds) * 1000).toISOString() : new Date().toISOString(),
          connector_type: 'scalekit',
          metadata: { name: acc.identifier },
        };
      });
      return { connections };
    } catch (err) {
      console.error('Failed to list Scalekit accounts:', err);
      return { connections: [] };
    }
  }
}
