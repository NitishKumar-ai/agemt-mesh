export type PostType =
  | 'text' | 'image' | 'video' | 'carousel' | 'story' | 'reel' | 'link' | 'article' | 'poll';

export type MediaType = 'jpeg' | 'png' | 'gif' | 'mp4' | 'mov' | 'webp' | 'pdf';

export type AuthType = 'oauth2' | 'session' | 'instance_oauth';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType: string;
  scope?: string;
  rawResponse: Record<string, any>;
}

export interface AccountProfile {
  platformId: string;
  name: string;
  handle?: string;
  avatarUrl?: string;
  followerCount: number;
  extra: Record<string, any>;
}

export interface PublishContent {
  text?: string;
  /** Publicly fetchable media URLs. Local filesystem paths are rejected by
   * providers — the social_studio Python autoposter passed a local
   * image_path straight through to Graph API's image_url/video_url params,
   * which only works against a URL, so this is intentionally narrowed. */
  mediaUrls?: string[];
  postType?: PostType;
}

export interface PublishResult {
  platformPostId: string;
  url?: string;
  extra: Record<string, any>;
}

export interface RateLimitConfig {
  requestsPerHour?: number;
  requestsPerDay?: number;
  publishPerDay?: number;
}
