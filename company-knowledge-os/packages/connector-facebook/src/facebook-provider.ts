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

const OAUTH_URL = 'https://www.facebook.com/v21.0/dialog/oauth';
const BASE_URL = 'https://graph.facebook.com/v21.0';
const TOKEN_URL = `${BASE_URL}/oauth/access_token`;

export class FacebookProvider extends SocialProviderBase {
  readonly platformName = 'Facebook';
  readonly authType: AuthType = 'oauth2';
  readonly maxCaptionLength = 63206;
  readonly requiredScopes = ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement'];

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
    return `${OAUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const { data } = await axios.get(TOKEN_URL, {
      params: {
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
        redirect_uri: redirectUri,
        code,
      },
    });
    if (!data?.access_token) {
      throw new Error(`Facebook token exchange failed: ${JSON.stringify(data)}`);
    }
    return this.toOAuthTokens(data);
  }

  async refreshToken(shortLivedToken: string): Promise<OAuthTokens> {
    const { data } = await axios.get(TOKEN_URL, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
        fb_exchange_token: shortLivedToken,
      },
    });
    return this.toOAuthTokens(data);
  }

  /** `pageId` must be supplied via credentials.extra at call time in the connector — see FacebookConnector. */
  async getProfile(accessToken: string, pageId?: string): Promise<AccountProfile> {
    let id = pageId;
    if (!id) {
      const pages = await axios.get(`${BASE_URL}/me/accounts`, { params: { access_token: accessToken } });
      id = pages.data?.data?.[0]?.id;
    }
    if (!id) throw new Error('No Facebook Page accessible with this token');

    const { data } = await axios.get(`${BASE_URL}/${id}`, {
      params: { access_token: accessToken, fields: 'name,picture,followers_count' },
    });
    return {
      platformId: id,
      name: data.name ?? '',
      avatarUrl: data.picture?.data?.url,
      followerCount: data.followers_count ?? 0,
      extra: data,
    };
  }

  async publish(accessToken: string, content: PublishContent, pageId?: string): Promise<PublishResult> {
    this.assertPubliclyFetchable(content.mediaUrls);
    const profile = await this.getProfile(accessToken, pageId);

    const endpoint = content.mediaUrls?.length
      ? `${BASE_URL}/${profile.platformId}/photos`
      : `${BASE_URL}/${profile.platformId}/feed`;
    const params: Record<string, any> = { access_token: accessToken, message: content.text ?? '' };
    if (content.mediaUrls?.length) params.url = content.mediaUrls[0];

    const { data, status } = await axios.post(endpoint, null, { params, validateStatus: () => true });
    const postId = data?.post_id ?? data?.id;
    if (status >= 300 || !postId) {
      throw new PublishError(`Facebook publish failed: ${JSON.stringify(data)}`, this.platformName, data);
    }
    return { platformPostId: postId, url: `https://www.facebook.com/${postId}`, extra: data };
  }
}
