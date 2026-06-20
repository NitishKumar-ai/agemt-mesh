export class OAuthError extends Error {
  constructor(message: string, public platform: string, public rawResponse?: any) {
    super(message);
    this.name = 'OAuthError';
  }
}

export class PublishError extends Error {
  constructor(message: string, public platform: string, public rawResponse?: any) {
    super(message);
    this.name = 'PublishError';
  }
}

export class RateLimitError extends Error {
  constructor(message: string, public platform: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}
