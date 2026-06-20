import axios from 'axios';
import { OAuthError } from './errors';
import { AccountProfile, AuthType, OAuthTokens, PublishContent, PublishResult, RateLimitConfig } from './types';

export interface SocialCredentials {
  clientId: string;
  clientSecret?: string;
}

/**
 * Shared behavior for OAuth2 social providers. Each platform-specific
 * connector extends this and only implements the endpoints/params that
 * differ. Mirrors the duplicated boilerplate previously copy-pasted across
 * the Python facebook.py/instagram.py/linkedin.py/etc providers — centralizing
 * it here is what lets the OAuth state-CSRF and PKCE fixes apply to every
 * platform at once instead of needing seven separate patches.
 */
export abstract class SocialProviderBase {
  constructor(protected credentials: SocialCredentials) {}

  abstract readonly platformName: string;
  abstract readonly authType: AuthType;
  abstract readonly maxCaptionLength: number;
  abstract readonly requiredScopes: string[];

  get rateLimits(): RateLimitConfig {
    return {};
  }

  abstract getAuthUrl(redirectUri: string, state: string, codeChallenge?: string): string;
  abstract exchangeCode(code: string, redirectUri: string, codeVerifier?: string): Promise<OAuthTokens>;
  abstract getProfile(accessToken: string): Promise<AccountProfile>;
  abstract publish(accessToken: string, content: PublishContent): Promise<PublishResult>;

  refreshToken(_refreshToken: string): Promise<OAuthTokens> {
    return Promise.reject(new OAuthError(`${this.platformName} does not support token refresh`, this.platformName));
  }

  /**
   * Validates and posts a token-exchange/refresh request, throwing a typed
   * OAuthError if the response doesn't include an access_token. Used by
   * subclasses for both exchangeCode and refreshToken to avoid re-deriving
   * the same "did this actually succeed" check per platform.
   */
  protected async postTokenRequest(
    url: string,
    params: Record<string, string>,
    headers: Record<string, string> = {}
  ): Promise<Record<string, any>> {
    const response = await axios.post(url, new URLSearchParams(params).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    });
    const body = response.data;
    if (!body?.access_token) {
      throw new OAuthError(`${this.platformName} token request failed: ${JSON.stringify(body)}`, this.platformName, body);
    }
    return body;
  }

  protected toOAuthTokens(body: Record<string, any>): OAuthTokens {
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresIn: body.expires_in,
      tokenType: body.token_type ?? 'Bearer',
      scope: body.scope,
      rawResponse: body,
    };
  }

  /**
   * Rejects local filesystem paths passed as media. The Python autoposter
   * (autoposter.py) handed a local image_path straight to Graph API's
   * image_url/video_url params, which only accept publicly fetchable URLs —
   * silently producing opaque 400s. Enforce the contract at the boundary
   * instead of letting each platform fail differently downstream.
   */
  protected assertPubliclyFetchable(mediaUrls?: string[]): void {
    for (const url of mediaUrls ?? []) {
      if (!/^https?:\/\//i.test(url)) {
        throw new Error(
          `${this.platformName}: media must be a public https URL, got "${url}". ` +
            `Upload the file to storage first and pass its public URL.`
        );
      }
    }
  }
}
