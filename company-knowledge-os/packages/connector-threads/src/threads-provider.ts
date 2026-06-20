import axios from 'axios';
import {
  AccountProfile,
  PublishContent,
  PublishError,
  PublishResult,
  SocialCredentials,
  OAuthTokens,
} from '@company-knowledge-os/connector-social-common';

const AUTH_URL = 'https://www.threads.net/oauth/authorize';
const TOKEN_URL = 'https://graph.threads.net/oauth/access_token';
const API_BASE = 'https://graph.threads.net/v1.0';

export class ThreadsProvider {
  readonly platformName = 'Threads';
  readonly maxCaptionLength = 500;
  readonly requiredScopes = ['threads_basic', 'threads_content_publish', 'threads_manage_replies', 'threads_manage_insights'];

  constructor(private credentials: SocialCredentials) {}

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
    // Step 1: exchange code for a short-lived token
    const params = new URLSearchParams({
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret ?? '',
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    });
    const { data: shortData } = await axios.post(TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!shortData?.access_token) {
      throw new Error(`Threads token exchange failed: ${JSON.stringify(shortData)}`);
    }
    // Step 2: exchange short-lived for long-lived token
    const { data: longData } = await axios.get(`${API_BASE}/access_token`, {
      params: {
        grant_type: 'th_exchange_token',
        client_secret: this.credentials.clientSecret,
        access_token: shortData.access_token,
      },
    });
    return {
      accessToken: longData.access_token ?? shortData.access_token,
      tokenType: 'Bearer',
      expiresIn: longData.expires_in,
      rawResponse: longData,
    };
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

  async publish(accessToken: string, content: PublishContent, replyToId?: string): Promise<PublishResult> {
    const profile = await this.getProfile(accessToken);
    const userId = profile.platformId;

    if (!userId) {
      throw new PublishError('Could not determine Threads user ID', this.platformName);
    }

    // Carousel logic
    if (content.mediaUrls && content.mediaUrls.length > 1) {
      return this.publishCarousel(accessToken, userId, content);
    }

    return this.publishSingle(accessToken, userId, content, replyToId);
  }

  private async publishSingle(accessToken: string, userId: string, content: PublishContent, replyToId?: string): Promise<PublishResult> {
    const isVideo = content.mediaUrls?.[0]?.toLowerCase().match(/\.(mp4|mov)$/);
    const hasMedia = !!content.mediaUrls?.length;

    const payload: any = {
      access_token: accessToken,
      text: (content.text ?? '').substring(0, this.maxCaptionLength),
    };

    if (hasMedia) {
      payload.media_type = isVideo ? 'VIDEO' : 'IMAGE';
      if (isVideo) {
        payload.video_url = content.mediaUrls![0];
      } else {
        payload.image_url = content.mediaUrls![0];
      }
    } else {
      payload.media_type = 'TEXT';
    }

    if (replyToId) {
      payload.reply_to_id = replyToId;
    }

    const { data: createData } = await axios.post(`${API_BASE}/${userId}/threads`, null, { params: payload });
    const creationId = createData.id;

    if (!creationId) {
      throw new PublishError(`Threads container creation failed: ${JSON.stringify(createData)}`, this.platformName);
    }

    await this.waitForContainer(accessToken, creationId);

    const { data: publishData } = await axios.post(`${API_BASE}/${userId}/threads_publish`, null, {
      params: { access_token: accessToken, creation_id: creationId },
    });

    if (!publishData.id) {
      throw new PublishError(`Threads publish failed: ${JSON.stringify(publishData)}`, this.platformName);
    }

    return { platformPostId: publishData.id, extra: publishData };
  }

  private async publishCarousel(accessToken: string, userId: string, content: PublishContent): Promise<PublishResult> {
    const childrenIds: string[] = [];

    for (const url of content.mediaUrls!) {
      const isVideo = url.toLowerCase().match(/\.(mp4|mov)$/);
      const payload: any = {
        access_token: accessToken,
        media_type: isVideo ? 'VIDEO' : 'IMAGE',
        is_carousel_item: 'true',
      };
      if (isVideo) {
        payload.video_url = url;
      } else {
        payload.image_url = url;
      }

      const { data: itemData } = await axios.post(`${API_BASE}/${userId}/threads`, null, { params: payload });
      if (!itemData.id) {
        throw new PublishError(`Carousel item creation failed: ${JSON.stringify(itemData)}`, this.platformName);
      }
      childrenIds.push(itemData.id);
    }

    // Wait for all children to be ready
    for (const id of childrenIds) {
      await this.waitForContainer(accessToken, id);
    }

    // Create carousel container
    const carouselPayload = {
      access_token: accessToken,
      media_type: 'CAROUSEL',
      children: childrenIds.join(','),
      text: (content.text ?? '').substring(0, this.maxCaptionLength),
    };

    const { data: createData } = await axios.post(`${API_BASE}/${userId}/threads`, null, { params: carouselPayload });
    const creationId = createData.id;

    if (!creationId) {
      throw new PublishError(`Carousel container creation failed: ${JSON.stringify(createData)}`, this.platformName);
    }

    await this.waitForContainer(accessToken, creationId);

    const { data: publishData } = await axios.post(`${API_BASE}/${userId}/threads_publish`, null, {
      params: { access_token: accessToken, creation_id: creationId },
    });

    return { platformPostId: publishData.id, extra: publishData };
  }

  private async waitForContainer(accessToken: string, creationId: string, maxAttempts = 20): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      const { data } = await axios.get(`${API_BASE}/${creationId}`, {
        params: { access_token: accessToken, fields: 'status,error_message' },
      });
      const status = data.status;

      if (status === 'FINISHED') return;
      if (status === 'ERROR') {
        throw new PublishError(`Container processing failed: ${data.error_message}`, this.platformName);
      }
      
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    throw new PublishError(`Timeout waiting for container ${creationId} to finish processing`, this.platformName);
  }
}
