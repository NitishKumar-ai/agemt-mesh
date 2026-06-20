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

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://www.googleapis.com/youtube/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/youtube/v3';

export class YouTubeProvider extends SocialProviderBase {
  readonly platformName = 'YouTube';
  readonly authType: AuthType = 'oauth2';
  readonly maxCaptionLength = 5000;
  readonly requiredScopes = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly',
  ];

  constructor(credentials: SocialCredentials) {
    super(credentials);
  }

  getAuthUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: this.credentials.clientId,
      redirect_uri: redirectUri,
      state,
      scope: this.requiredScopes.join(' '),
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const body = await this.postTokenRequest(TOKEN_URL, {
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret ?? '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });
    return this.toOAuthTokens(body);
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const body = await this.postTokenRequest(TOKEN_URL, {
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret ?? '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    return this.toOAuthTokens(body);
  }

  async getProfile(accessToken: string): Promise<AccountProfile> {
    const { data } = await axios.get(`${API_BASE}/channels`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { part: 'snippet,statistics', mine: true },
    });
    const channel = data.items?.[0];
    if (!channel) throw new Error('No YouTube channel found for this account');

    return {
      platformId: channel.id,
      name: channel.snippet?.title ?? '',
      avatarUrl: channel.snippet?.thumbnails?.default?.url,
      followerCount: Number(channel.statistics?.subscriberCount ?? 0),
      extra: channel,
    };
  }

  /** Uploads a video by streaming bytes downloaded from a public mediaUrls[0] (YouTube has no "publish by URL" — the bytes must be uploaded). */
  async publish(accessToken: string, content: PublishContent): Promise<PublishResult> {
    this.assertPubliclyFetchable(content.mediaUrls);
    if (!content.mediaUrls?.length) {
      throw new PublishError('YouTube requires a video file URL', this.platformName);
    }

    const video = await axios.get<ArrayBuffer>(content.mediaUrls[0], { responseType: 'arraybuffer' });

    const { data, status } = await axios.post(
      `${UPLOAD_BASE}/videos?part=snippet,status&uploadType=media`,
      Buffer.from(video.data),
      {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'video/*' },
        validateStatus: () => true,
        params: undefined,
      }
    );

    const videoId = data?.id;
    if (status >= 300 || !videoId) {
      throw new PublishError(`YouTube publish failed: ${JSON.stringify(data)}`, this.platformName, data);
    }

    // Title/description set via the snippet on initial upload isn't carried by the media-only
    // upload above; patch it in a follow-up call so callers can still pass content.text as title.
    if (content.text) {
      await axios.put(
        `${API_BASE}/videos?part=snippet`,
        { id: videoId, snippet: { title: content.text.slice(0, 100), categoryId: '22' } },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
    }

    return { platformPostId: videoId, url: `https://www.youtube.com/watch?v=${videoId}`, extra: data };
  }
}
