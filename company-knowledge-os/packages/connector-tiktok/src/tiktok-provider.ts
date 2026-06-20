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

const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const API_BASE = 'https://open.tiktokapis.com/v2';

export class TikTokProvider extends SocialProviderBase {
  readonly platformName = 'TikTok';
  readonly authType: AuthType = 'oauth2';
  readonly maxCaptionLength = 2200;
  readonly requiredScopes = ['user.info.basic', 'video.publish', 'video.upload'];

  constructor(credentials: SocialCredentials) {
    super(credentials);
  }

  getAuthUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_key: this.credentials.clientId,
      redirect_uri: redirectUri,
      state,
      scope: this.requiredScopes.join(','),
      response_type: 'code',
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const body = await this.postTokenRequest(TOKEN_URL, {
      client_key: this.credentials.clientId,
      client_secret: this.credentials.clientSecret ?? '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });
    return this.toOAuthTokens(body);
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const body = await this.postTokenRequest(TOKEN_URL, {
      client_key: this.credentials.clientId,
      client_secret: this.credentials.clientSecret ?? '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    return this.toOAuthTokens(body);
  }

  async getProfile(accessToken: string): Promise<AccountProfile> {
    const { data } = await axios.get(`${API_BASE}/user/info/`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { fields: 'open_id,display_name,avatar_url,follower_count' },
    });
    const user = data.data?.user ?? {};
    return {
      platformId: user.open_id ?? '',
      name: user.display_name ?? '',
      avatarUrl: user.avatar_url,
      followerCount: user.follower_count ?? 0,
      extra: user,
    };
  }

  /** Publishes via inbox (draft) init, as direct posting requires additional content-posting API approval. */
  async publish(accessToken: string, content: PublishContent): Promise<PublishResult> {
    this.assertPubliclyFetchable(content.mediaUrls);
    if (!content.mediaUrls?.length) {
      throw new PublishError('TikTok requires a video URL', this.platformName);
    }

    const { data, status } = await axios.post(
      `${API_BASE}/post/publish/video/init/`,
      {
        post_info: { title: content.text ?? '' },
        source_info: { source: 'PULL_FROM_URL', video_url: content.mediaUrls[0] },
      },
      { headers: { Authorization: `Bearer ${accessToken}` }, validateStatus: () => true }
    );

    const publishId = data?.data?.publish_id;
    if (status >= 300 || !publishId) {
      throw new PublishError(`TikTok publish failed: ${JSON.stringify(data)}`, this.platformName, data);
    }
    return { platformPostId: publishId, extra: data };
  }
}
