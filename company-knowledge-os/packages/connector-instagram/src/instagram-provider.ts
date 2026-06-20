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

/** Instagram publishing rides on the Facebook Graph API (Instagram Business accounts). */
export class InstagramProvider extends SocialProviderBase {
  readonly platformName = 'Instagram';
  readonly authType: AuthType = 'oauth2';
  readonly maxCaptionLength = 2200;
  readonly requiredScopes = [
    'instagram_basic',
    'instagram_content_publish',
    'pages_show_list',
    'pages_read_engagement',
  ];

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
      throw new Error(`Instagram token exchange failed: ${JSON.stringify(data)}`);
    }
    return this.toOAuthTokens(data);
  }

  /** Exchanges a short-lived token for a long-lived one (60 days). */
  async refreshToken(shortLivedToken: string): Promise<OAuthTokens> {
    const { data } = await axios.get(`${BASE_URL}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
        fb_exchange_token: shortLivedToken,
      },
    });
    return this.toOAuthTokens(data);
  }

  async getProfile(accessToken: string): Promise<AccountProfile> {
    const pages = await axios.get(`${BASE_URL}/me/accounts`, {
      params: { access_token: accessToken, fields: 'instagram_business_account' },
    });
    const igAccountId = pages.data?.data?.[0]?.instagram_business_account?.id;
    if (!igAccountId) throw new Error('No Instagram Business account linked to this Facebook page');

    const { data } = await axios.get(`${BASE_URL}/${igAccountId}`, {
      params: { access_token: accessToken, fields: 'username,name,profile_picture_url,followers_count' },
    });

    return {
      platformId: igAccountId,
      name: data.name ?? data.username ?? '',
      handle: data.username,
      avatarUrl: data.profile_picture_url,
      followerCount: data.followers_count ?? 0,
      extra: data,
    };
  }

  async publish(accessToken: string, content: PublishContent): Promise<PublishResult> {
    this.assertPubliclyFetchable(content.mediaUrls);
    if (!content.mediaUrls?.length) {
      throw new PublishError('Instagram requires at least one image or video URL', this.platformName);
    }
    const profile = await this.getProfile(accessToken);

    const container = await axios.post(`${BASE_URL}/${profile.platformId}/media`, null, {
      params: {
        access_token: accessToken,
        image_url: content.mediaUrls[0],
        caption: content.text ?? '',
      },
    });
    const creationId = container.data?.id;
    if (!creationId) throw new PublishError(`Instagram media container failed: ${JSON.stringify(container.data)}`, this.platformName);

    const publish = await axios.post(`${BASE_URL}/${profile.platformId}/media_publish`, null, {
      params: { access_token: accessToken, creation_id: creationId },
    });
    const postId = publish.data?.id;
    if (!postId) throw new PublishError(`Instagram publish failed: ${JSON.stringify(publish.data)}`, this.platformName);

    return { platformPostId: postId, url: `https://www.instagram.com/p/${postId}/`, extra: publish.data };
  }
}
