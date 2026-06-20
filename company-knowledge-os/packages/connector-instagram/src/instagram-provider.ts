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
    const igAccountId = profile.platformId;

    if (content.postType === 'carousel') {
      return this.publishCarousel(accessToken, igAccountId, content);
    }
    return this.publishSingle(accessToken, igAccountId, content);
  }

  private async publishSingle(accessToken: string, igAccountId: string, content: PublishContent): Promise<PublishResult> {
    const payload: Record<string, any> = {};
    if (content.text) payload.caption = content.text;

    if (content.postType === 'reel') {
      payload.media_type = 'REELS';
      payload.video_url = content.mediaUrls![0];
    } else if (content.postType === 'story') {
      const url = content.mediaUrls![0].toLowerCase();
      payload.media_type = 'STORIES';
      if (url.endsWith('.mp4') || url.endsWith('.mov')) {
        payload.video_url = content.mediaUrls![0];
      } else {
        payload.image_url = content.mediaUrls![0];
      }
    } else {
      payload.image_url = content.mediaUrls![0];
    }

    const containerId = await this.createContainer(accessToken, igAccountId, payload);
    await this.waitForContainer(accessToken, containerId);
    return this.publishContainer(accessToken, igAccountId, containerId);
  }

  private async publishCarousel(accessToken: string, igAccountId: string, content: PublishContent): Promise<PublishResult> {
    const childIds: string[] = [];

    for (const url of content.mediaUrls!) {
      const isVideo = url.toLowerCase().endsWith('.mp4') || url.toLowerCase().endsWith('.mov');
      const childPayload: Record<string, any> = { is_carousel_item: true };
      if (isVideo) {
        childPayload.media_type = 'VIDEO';
        childPayload.video_url = url;
      } else {
        childPayload.image_url = url;
      }

      const childId = await this.createContainer(accessToken, igAccountId, childPayload);
      await this.waitForContainer(accessToken, childId);
      childIds.push(childId);
    }

    const carouselPayload: Record<string, any> = {
      media_type: 'CAROUSEL',
      children: childIds.join(','),
    };
    if (content.text) carouselPayload.caption = content.text;

    const carouselId = await this.createContainer(accessToken, igAccountId, carouselPayload);
    await this.waitForContainer(accessToken, carouselId);
    return this.publishContainer(accessToken, igAccountId, carouselId);
  }

  private async createContainer(accessToken: string, igAccountId: string, payload: Record<string, any>): Promise<string> {
    const { data } = await axios.post(`${BASE_URL}/${igAccountId}/media`, null, {
      params: { access_token: accessToken, ...payload },
    });
    if (!data?.id) {
      throw new PublishError(`Instagram container creation failed: ${JSON.stringify(data)}`, this.platformName, data);
    }
    return data.id;
  }

  private async waitForContainer(accessToken: string, containerId: string): Promise<void> {
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const maxAttempts = 60;

    for (let i = 0; i < maxAttempts; i++) {
      const { data } = await axios.get(`${BASE_URL}/${containerId}`, {
        params: { access_token: accessToken, fields: 'status_code,status' },
      });
      const status = data?.status_code;

      if (status === 'FINISHED') return;
      if (status === 'ERROR') {
        throw new PublishError(`Instagram container failed: ${data?.status || 'unknown'}`, this.platformName, data);
      }
      await delay(2000);
    }
    throw new PublishError('Instagram container processing timed out', this.platformName);
  }

  private async publishContainer(accessToken: string, igAccountId: string, containerId: string): Promise<PublishResult> {
    const { data } = await axios.post(`${BASE_URL}/${igAccountId}/media_publish`, null, {
      params: { access_token: accessToken, creation_id: containerId },
    });
    if (!data?.id) {
      throw new PublishError(`Instagram publish failed: ${JSON.stringify(data)}`, this.platformName, data);
    }
    return { platformPostId: data.id, url: `https://www.instagram.com/p/${data.id}/`, extra: data };
  }
}
