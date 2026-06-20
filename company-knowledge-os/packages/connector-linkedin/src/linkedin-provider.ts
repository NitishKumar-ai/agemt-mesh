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

    const hasMedia = content.postType === 'image' && (content.mediaUrls?.length ?? 0) > 0;
    const body = hasMedia
      ? await this.buildImagePostBody(accessToken, author, content)
      : this.buildTextPostBody(author, content);

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
}
