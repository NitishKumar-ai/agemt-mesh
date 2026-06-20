import axios from 'axios';
import FormData from 'form-data';
import {
  AccountProfile,
  AuthType,
  OAuthTokens,
  PublishContent,
  PublishError,
  PublishResult,
  RateLimitConfig,
  SocialCredentials,
  SocialProviderBase,
} from '@company-knowledge-os/connector-social-common';

const AUTH_URL = 'https://twitter.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
const API_BASE = 'https://api.twitter.com/2';
const MEDIA_UPLOAD_URL = 'https://upload.twitter.com/1.1/media/upload.json';

/**
 * Twitter/X OAuth2 + PKCE provider.
 *
 * The Python version generated a code_verifier and discarded it (never
 * persisted for the callback), and used the *state* value itself as the
 * PKCE code_challenge with method "plain" — i.e. no real PKCE protection.
 * Here the caller (the OAuth route, via OAuthStateStore) is responsible for
 * generating a real verifier/challenge pair with generatePkce(), storing the
 * verifier keyed by state, and passing both challenge (here) and verifier
 * (to exchangeCode) at the right step.
 */
export class TwitterProvider extends SocialProviderBase {
  readonly platformName = 'Twitter';
  readonly authType: AuthType = 'oauth2';
  readonly maxCaptionLength = 280;
  readonly requiredScopes = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];

  constructor(credentials: SocialCredentials) {
    super(credentials);
  }

  get rateLimits(): RateLimitConfig {
    return { requestsPerHour: 300, requestsPerDay: 5000, publishPerDay: 300 };
  }

  getAuthUrl(redirectUri: string, state: string, codeChallenge?: string): string {
    if (!codeChallenge) {
      throw new Error('Twitter OAuth requires a PKCE code_challenge (use generatePkce())');
    }
    const params = new URLSearchParams({
      client_id: this.credentials.clientId,
      redirect_uri: redirectUri,
      state,
      response_type: 'code',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      scope: this.requiredScopes.join(' '),
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string, codeVerifier?: string): Promise<OAuthTokens> {
    if (!codeVerifier) {
      throw new Error('Twitter token exchange requires the PKCE code_verifier generated at auth time');
    }
    const body = await this.postTokenRequest(
      TOKEN_URL,
      {
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      },
      { Authorization: `Basic ${this.basicAuth()}` }
    );
    return this.toOAuthTokens(body);
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const body = await this.postTokenRequest(
      TOKEN_URL,
      { refresh_token: refreshToken, grant_type: 'refresh_token' },
      { Authorization: `Basic ${this.basicAuth()}` }
    );
    return this.toOAuthTokens(body);
  }

  async getProfile(accessToken: string): Promise<AccountProfile> {
    const { data } = await axios.get(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { 'user.fields': 'id,name,username,profile_image_url,public_metrics' },
    });
    const user = data.data ?? {};
    const metrics = user.public_metrics ?? {};
    return {
      platformId: user.id ?? '',
      name: user.name ?? '',
      handle: user.username,
      avatarUrl: user.profile_image_url,
      followerCount: metrics.followers_count ?? 0,
      extra: user,
    };
  }

  async publish(accessToken: string, content: PublishContent): Promise<PublishResult> {
    if (!content.text && !(content.mediaUrls?.length)) {
      throw new PublishError('Tweet must contain text or media', this.platformName);
    }
    this.assertPubliclyFetchable(content.mediaUrls);

    const payload: Record<string, any> = {};
    if (content.text) payload.text = content.text.slice(0, this.maxCaptionLength);

    if (content.mediaUrls?.length) {
      const mediaIds = await this.uploadMedia(accessToken, content.mediaUrls.slice(0, 4));
      if (mediaIds.length) payload.media = { media_ids: mediaIds };
    }

    const { data, status } = await axios.post(`${API_BASE}/tweets`, payload, {
      headers: { Authorization: `Bearer ${accessToken}` },
      validateStatus: () => true,
    });

    const tweetId = data?.data?.id;
    if (status >= 300 || !tweetId) {
      throw new PublishError(`Twitter publish failed: ${JSON.stringify(data)}`, this.platformName, data);
    }

    const profile = await this.getProfile(accessToken);
    return {
      platformPostId: tweetId,
      url: `https://twitter.com/${profile.handle}/status/${tweetId}`,
      extra: data,
    };
  }

  /**
   * Downloads each public media URL and uploads it to Twitter's v1.1 media
   * endpoint. The Python implementation explicitly skipped media URL
   * uploads ("Skipping media URL upload for Twitter") and only supported
   * local file paths — meaning published tweets silently lost their images.
   */
  private async uploadMedia(accessToken: string, mediaUrls: string[]): Promise<string[]> {
    const mediaIds: string[] = [];
    for (const url of mediaUrls) {
      const file = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer' });
      const form = new FormData();
      form.append('media', Buffer.from(file.data), { filename: 'media' });

      const { data } = await axios.post(MEDIA_UPLOAD_URL, form, {
        headers: { Authorization: `Bearer ${accessToken}`, ...form.getHeaders() },
      });
      if (data?.media_id_string) mediaIds.push(String(data.media_id_string));
    }
    return mediaIds;
  }

  private basicAuth(): string {
    return Buffer.from(`${this.credentials.clientId}:${this.credentials.clientSecret ?? ''}`).toString('base64');
  }
}
