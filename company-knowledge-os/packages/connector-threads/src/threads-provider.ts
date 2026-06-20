import axios from 'axios';
import {
  AccountProfile,
  AuthType,
  OAuthTokens,
  PublishContent,
  PublishError,
  PublishResult,
  SocialCredentials,
  SocialProviderBase,
} from '@company-knowledge-os/connector-social-common';

const AUTH_URL = 'https://www.threads.net/oauth/authorize';
const TOKEN_URL = 'https://graph.threads.net/oauth/access_token';
const API_BASE = 'https://graph.threads.net/v1.0';

export class ThreadsProvider extends SocialProviderBase {
  readonly platformName = 'Threads';
  readonly authType: AuthType = 'oauth2';
  readonly maxCaptionLength = 500;
  readonly requiredScopes = ['threads_basic', 'threads_content_publish'];

  constructor(credentials: SocialCredentials) {
    super(credentials);
  }

  getAuthUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: this.credentials.clientId,
      redirect_uri: redirectUri,
      state,
      scope: this.requiredScopes.join(','),
      response_type: 'code',
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const body = await this.postTokenRequest(TOKEN_URL, {
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret ?? '',
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    });
    // Threads issues a short-lived token from this endpoint; exchange for long-lived immediately.
    return this.refreshToken(body.access_token);
  }

  async refreshToken(token: string): Promise<OAuthTokens> {
    const { data } = await axios.get(`${API_BASE}/access_token`, {
      params: {
        grant_type: 'th_exchange_token',
        client_secret: this.credentials.clientSecret,
        access_token: token,
      },
    });
    if (!data?.access_token) {
      throw new Error(`Threads token exchange failed: ${JSON.stringify(data)}`);
    }
    return this.toOAuthTokens(data);
  }

  async getProfile(accessToken: string): Promise<AccountProfile> {
    const { data } = await axios.get(`${API_BASE}/me`, {
      params: { access_token: accessToken, fields: 'id,username,name,threads_profile_picture_url' },
    });
    return {
      platformId: data.id ?? '',
      name: data.name ?? data.username ?? '',
      handle: data.username,
      avatarUrl: data.threads_profile_picture_url,
      followerCount: 0,
      extra: data,
    };
  }

  async publish(accessToken: string, content: PublishContent): Promise<PublishResult> {
    this.assertPubliclyFetchable(content.mediaUrls);
    const profile = await this.getProfile(accessToken);

    const params: Record<string, any> = {
      access_token: accessToken,
      media_type: content.mediaUrls?.length ? 'IMAGE' : 'TEXT',
      text: content.text ?? '',
    };
    if (content.mediaUrls?.length) params.image_url = content.mediaUrls[0];

    const container = await axios.post(`${API_BASE}/${profile.platformId}/threads`, null, { params });
    const creationId = container.data?.id;
    if (!creationId) throw new PublishError(`Threads container failed: ${JSON.stringify(container.data)}`, this.platformName);

    const publish = await axios.post(`${API_BASE}/${profile.platformId}/threads_publish`, null, {
      params: { access_token: accessToken, creation_id: creationId },
    });
    const postId = publish.data?.id;
    if (!postId) throw new PublishError(`Threads publish failed: ${JSON.stringify(publish.data)}`, this.platformName);

    return { platformPostId: postId, extra: publish.data };
  }
}
