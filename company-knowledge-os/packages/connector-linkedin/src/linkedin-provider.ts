import axios from 'axios';
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

const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const API_BASE = 'https://api.linkedin.com';

// LinkedIn sunsets versioned APIs after ~1 year; bump to the latest YYYYMM
// per https://learn.microsoft.com/en-us/linkedin/marketing/versioning before
// the current value falls out of support.
const LINKEDIN_HEADERS = {
  'LinkedIn-Version': '202604',
  'X-Restli-Protocol-Version': '2.0.0',
};

export class LinkedInProvider extends SocialProviderBase {
  readonly platformName = 'LinkedIn';
  readonly authType: AuthType = 'oauth2';
  readonly maxCaptionLength = 3000;
  readonly requiredScopes = [
    'openid',
    'profile',
    'w_member_social',
    'r_organization_social',
    'w_organization_social',
    'rw_organization_admin',
  ];

  constructor(credentials: SocialCredentials) {
    super(credentials);
  }

  get rateLimits(): RateLimitConfig {
    return { requestsPerHour: 200, requestsPerDay: 100, publishPerDay: 100 };
  }

  getAuthUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.credentials.clientId,
      redirect_uri: redirectUri,
      state,
      scope: this.requiredScopes.join(' '),
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const body = await this.postTokenRequest(TOKEN_URL, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret ?? '',
    });
    return this.toOAuthTokens(body);
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const body = await this.postTokenRequest(TOKEN_URL, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret ?? '',
    });
    return this.toOAuthTokens(body);
  }

  async getProfile(accessToken: string): Promise<AccountProfile> {
    const { data } = await axios.get(`${API_BASE}/v2/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}`, ...LINKEDIN_HEADERS },
    });

    const sub: string = data.sub ?? '';
    const name: string = data.name ?? `${data.given_name ?? ''} ${data.family_name ?? ''}`.trim();

    let followerCount = 0;
    if (sub) {
      try {
        const ns = await axios.get(
          `${API_BASE}/v2/networkSizes/urn:li:person:${sub}?edgeType=MemberFollowedByMember`,
          { headers: { Authorization: `Bearer ${accessToken}`, ...LINKEDIN_HEADERS } }
        );
        followerCount = ns.data.firstDegreeSize ?? 0;
      } catch {
        // Follower count requires scopes the token may not have; non-fatal.
      }
    }

    return { platformId: sub, name, avatarUrl: data.picture, followerCount, extra: data };
  }

  async publish(accessToken: string, content: PublishContent): Promise<PublishResult> {
    this.assertPubliclyFetchable(content.mediaUrls);
    const profile = await this.getProfile(accessToken);
    const author = `urn:li:person:${profile.platformId}`;

    let body: any;
    if (content.postType === 'image' && (content.mediaUrls?.length ?? 0) > 0) {
      body = await this.buildImagePostBody(accessToken, author, content);
    } else if (content.postType === 'video' && (content.mediaUrls?.length ?? 0) > 0) {
      body = await this.buildVideoPostBody(accessToken, author, content);
    } else {
      body = this.buildTextPostBody(author, content);
    }

    const { data, status } = await axios.post(`${API_BASE}/v2/ugcPosts`, body, {
      headers: { Authorization: `Bearer ${accessToken}`, ...LINKEDIN_HEADERS },
      validateStatus: () => true,
    });

    if (status >= 300) {
      throw new PublishError(`LinkedIn publish failed: ${JSON.stringify(data)}`, this.platformName, data);
    }

    const postId = data.id ?? '';
    return { platformPostId: postId, url: postId ? `https://www.linkedin.com/feed/update/${postId}` : undefined, extra: data };
  }

  private buildTextPostBody(author: string, content: PublishContent) {
    return {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: content.text ?? '' },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    };
  }

  private async buildImagePostBody(accessToken: string, author: string, content: PublishContent) {
    const imageUrl = content.mediaUrls![0];

    const register = await axios.post(
      `${API_BASE}/v2/assets?action=registerUpload`,
      {
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: author,
          serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
        },
      },
      { headers: { Authorization: `Bearer ${accessToken}`, ...LINKEDIN_HEADERS } }
    );

    const uploadUrl = register.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
    const asset = register.data.value.asset;

    const imageBytes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    await axios.put(uploadUrl, imageBytes.data, { headers: { Authorization: `Bearer ${accessToken}` } });

    return {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: content.text ?? '' },
          shareMediaCategory: 'IMAGE',
          media: [{ status: 'READY', media: asset }],
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    };
  }

  private async buildVideoPostBody(accessToken: string, author: string, content: PublishContent) {
    const videoUrl = content.mediaUrls![0];
    const videoBytes = await axios.get(videoUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(videoBytes.data);
    const fileSizeBytes = buffer.length;

    // Step 1: Initialize
    const initResp = await axios.post(
      `${API_BASE}/rest/videos?action=initializeUpload`,
      { initializeUploadRequest: { owner: author, fileSizeBytes } },
      { headers: { Authorization: `Bearer ${accessToken}`, ...LINKEDIN_HEADERS } }
    );
    const { video, uploadInstructions, uploadToken } = initResp.data.value;

    if (!video || !uploadInstructions) {
      throw new PublishError(`LinkedIn video init failed: ${JSON.stringify(initResp.data)}`, this.platformName);
    }

    // Step 2: Upload chunks
    const uploadedPartIds: string[] = [];
    for (const instruction of uploadInstructions) {
      const { uploadUrl, firstByte, lastByte } = instruction;
      const chunk = buffer.slice(firstByte, lastByte + 1);
      
      const uploadResp = await axios.put(uploadUrl, chunk, {
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      
      let etag = uploadResp.headers.etag || '';
      if (etag.startsWith('"') && etag.endsWith('"')) {
        etag = etag.slice(1, -1);
      }
      uploadedPartIds.push(etag);
    }

    // Step 3: Finalize
    await axios.post(
      `${API_BASE}/rest/videos?action=finalizeUpload`,
      { finalizeUploadRequest: { video, uploadToken, uploadedPartIds } },
      { headers: { Authorization: `Bearer ${accessToken}`, ...LINKEDIN_HEADERS } }
    );

    // Step 4: Wait for AVAILABLE status
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const maxAttempts = 60;
    let isAvailable = false;
    
    for (let i = 0; i < maxAttempts; i++) {
      const statusResp = await axios.get(`${API_BASE}/rest/videos/${encodeURIComponent(video)}`, {
        headers: { Authorization: `Bearer ${accessToken}`, ...LINKEDIN_HEADERS },
      });
      const status = statusResp.data.status;
      if (status === 'AVAILABLE') {
        isAvailable = true;
        break;
      }
      if (status === 'PROCESSING_FAILED') {
        throw new PublishError(`LinkedIn video processing failed: ${statusResp.data.processingFailureReason}`, this.platformName);
      }
      await delay(3000);
    }

    if (!isAvailable) {
      throw new PublishError('LinkedIn video processing timed out', this.platformName);
    }

    return {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: content.text ?? '' },
          shareMediaCategory: 'VIDEO',
          media: [{ status: 'READY', media: video }],
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    };
  }
}
