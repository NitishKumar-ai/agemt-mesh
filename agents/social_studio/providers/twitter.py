"""Twitter/X API v2 provider implementation."""

from __future__ import annotations

import logging
from datetime import datetime
from urllib.parse import urlencode

from .base import SocialProvider
from .exceptions import OAuthError, PublishError
from .types import (
    AccountMetrics,
    AccountProfile,
    AuthType,
    MediaType,
    OAuthTokens,
    PostMetrics,
    PostType,
    PublishContent,
    PublishResult,
    RateLimitConfig,
)

logger = logging.getLogger(__name__)

AUTH_URL = "https://twitter.com/i/oauth2/authorize"
TOKEN_URL = "https://api.twitter.com/2/oauth2/token"
API_BASE = "https://api.twitter.com/2"


class TwitterProvider(SocialProvider):
    """Twitter/X API v2 provider using OAuth 2.0 with PKCE."""

    def __init__(self, credentials: dict | None = None):
        super().__init__(credentials)

    # ------------------------------------------------------------------
    # Metadata
    # ------------------------------------------------------------------

    @property
    def platform_name(self) -> str:
        return "Twitter"

    @property
    def auth_type(self) -> AuthType:
        return AuthType.OAUTH2

    @property
    def max_caption_length(self) -> int:
        return 280

    @property
    def supported_post_types(self) -> list[PostType]:
        return [PostType.TEXT, PostType.IMAGE, PostType.VIDEO, PostType.POLL]

    @property
    def supported_media_types(self) -> list[MediaType]:
        return [MediaType.JPEG, MediaType.PNG, MediaType.GIF, MediaType.MP4, MediaType.MOV]

    @property
    def required_scopes(self) -> list[str]:
        return [
            "tweet.read",
            "tweet.write",
            "users.read",
            "offline.access",
        ]

    @property
    def rate_limits(self) -> RateLimitConfig:
        return RateLimitConfig(
            requests_per_hour=300,
            requests_per_day=5000,
            publish_per_day=300,
        )

    # ------------------------------------------------------------------
    # OAuth 2.0 with PKCE
    # ------------------------------------------------------------------

    def get_auth_url(self, redirect_uri: str, state: str, code_challenge: str | None = None) -> str:
        """Generate OAuth 2.0 authorization URL with PKCE.
        
        Args:
            redirect_uri: OAuth callback URL
            state: CSRF protection token
            code_challenge: PKCE code challenge (optional, will use state if not provided)
        """
        params = {
            "client_id": self.credentials["client_id"],
            "redirect_uri": redirect_uri,
            "state": state,
            "response_type": "code",
            "code_challenge": code_challenge or state,
            "code_challenge_method": "plain",
            "scope": " ".join(self.required_scopes),
        }
        return f"{AUTH_URL}?{urlencode(params)}"

    def exchange_code(
        self,
        code: str,
        redirect_uri: str,
        code_verifier: str | None = None,
    ) -> OAuthTokens:
        """Exchange authorization code for access tokens.
        
        Args:
            code: Authorization code from callback
            redirect_uri: Must match the one used in get_auth_url
            code_verifier: PKCE code verifier (optional)
        """
        import base64

        # Build Basic Auth header
        client_id = self.credentials["client_id"]
        client_secret = self.credentials.get("client_secret", "")
        auth_str = f"{client_id}:{client_secret}"
        auth_b64 = base64.b64encode(auth_str.encode()).decode()

        resp = self._request(
            "POST",
            TOKEN_URL,
            headers={
                "Authorization": f"Basic {auth_b64}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
                "code_verifier": code_verifier or code,
            },
        )
        body = resp.json()

        if "access_token" not in body:
            raise OAuthError(
                f"Twitter token exchange failed: {body}",
                platform=self.platform_name,
                raw_response=body,
            )

        return OAuthTokens(
            access_token=body["access_token"],
            refresh_token=body.get("refresh_token"),
            expires_in=body.get("expires_in"),
            token_type=body.get("token_type", "Bearer"),
            scope=body.get("scope"),
            raw_response=body,
        )

    def refresh_token(self, refresh_token: str) -> OAuthTokens:
        """Refresh an expired access token."""
        import base64

        client_id = self.credentials["client_id"]
        client_secret = self.credentials.get("client_secret", "")
        auth_str = f"{client_id}:{client_secret}"
        auth_b64 = base64.b64encode(auth_str.encode()).decode()

        resp = self._request(
            "POST",
            TOKEN_URL,
            headers={
                "Authorization": f"Basic {auth_b64}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
        body = resp.json()

        if "access_token" not in body:
            raise OAuthError(
                f"Twitter token refresh failed: {body}",
                platform=self.platform_name,
                raw_response=body,
            )

        return OAuthTokens(
            access_token=body["access_token"],
            refresh_token=body.get("refresh_token", refresh_token),
            expires_in=body.get("expires_in"),
            token_type=body.get("token_type", "Bearer"),
            raw_response=body,
        )

    # ------------------------------------------------------------------
    # Profile
    # ------------------------------------------------------------------

    def get_profile(self, access_token: str) -> AccountProfile:
        """Fetch the authenticated user's Twitter profile."""
        resp = self._request(
            "GET",
            f"{API_BASE}/users/me",
            access_token=access_token,
            params={
                "user.fields": "id,name,username,profile_image_url,public_metrics",
            },
        )
        body = resp.json()
        data = body.get("data", {})
        metrics = data.get("public_metrics", {})

        return AccountProfile(
            platform_id=data.get("id", ""),
            name=data.get("name", ""),
            handle=data.get("username"),
            avatar_url=data.get("profile_image_url"),
            follower_count=metrics.get("followers_count", 0),
            extra=data,
        )

    # ------------------------------------------------------------------
    # Publishing
    # ------------------------------------------------------------------

    def publish_post(self, access_token: str, content: PublishContent) -> PublishResult:
        """Publish a tweet to Twitter/X."""
        if not content.text and not content.media_urls:
            raise PublishError(
                "Tweet must contain text or media",
                platform=self.platform_name,
            )

        payload: dict = {}

        # Add text
        if content.text:
            payload["text"] = content.text[: self.max_caption_length]

        # Handle media uploads
        if content.media_urls or content.media_files:
            media_ids = self._upload_media(access_token, content)
            if media_ids:
                payload["media"] = {"media_ids": media_ids}

        # Handle polls
        if content.post_type == PostType.POLL and content.extra.get("poll_options"):
            poll_data = {
                "options": content.extra["poll_options"],
                "duration_minutes": content.extra.get("poll_duration_minutes", 1440),
            }
            payload["poll"] = poll_data

        # Publish tweet
        resp = self._request(
            "POST",
            f"{API_BASE}/tweets",
            access_token=access_token,
            json=payload,
        )
        body = resp.json()
        data = body.get("data", {})
        tweet_id = data.get("id", "")

        if not tweet_id:
            raise PublishError(
                f"Twitter publish failed: {body}",
                platform=self.platform_name,
                raw_response=body,
            )

        # Get username for URL construction
        profile = self.get_profile(access_token)
        tweet_url = f"https://twitter.com/{profile.handle}/status/{tweet_id}"

        return PublishResult(
            platform_post_id=tweet_id,
            url=tweet_url,
            extra=body,
        )

    def _upload_media(self, access_token: str, content: PublishContent) -> list[str]:
        """Upload media files to Twitter and return media IDs.
        
        Note: Twitter v2 API media upload uses v1.1 endpoints.
        """
        media_ids: list[str] = []

        # Handle media URLs (need to download first)
        for url in content.media_urls[:4]:  # Twitter allows up to 4 images
            # For now, we'll skip URL uploads as they require downloading
            # In production, you'd download the URL and upload as file
            logger.warning(f"Skipping media URL upload for Twitter: {url}")

        # Handle local files
        for file_path in content.media_files[:4]:
            try:
                media_id = self._upload_media_file(access_token, file_path)
                if media_id:
                    media_ids.append(media_id)
            except Exception as e:
                logger.error(f"Failed to upload media file {file_path}: {e}")

        return media_ids

    def _upload_media_file(self, access_token: str, file_path: str) -> str:
        """Upload a single media file to Twitter v1.1 API."""
        import mimetypes

        mime_type, _ = mimetypes.guess_type(file_path)

        with open(file_path, "rb") as f:
            files = {"media": (file_path, f, mime_type)}
            
            resp = self._request(
                "POST",
                "https://upload.twitter.com/1.1/media/upload.json",
                access_token=access_token,
                files=files,
            )
            
        body = resp.json()
        return str(body.get("media_id_string", ""))

    # ------------------------------------------------------------------
    # Analytics
    # ------------------------------------------------------------------

    def get_post_metrics(self, access_token: str, post_id: str) -> PostMetrics:
        """Fetch engagement metrics for a specific tweet.
        
        Note: Requires Twitter API v2 with appropriate access level.
        """
        resp = self._request(
            "GET",
            f"{API_BASE}/tweets/{post_id}",
            access_token=access_token,
            params={
                "tweet.fields": "public_metrics",
            },
        )
        body = resp.json()
        data = body.get("data", {})
        metrics = data.get("public_metrics", {})

        return PostMetrics(
            impressions=metrics.get("impression_count", 0),
            likes=metrics.get("like_count", 0),
            comments=metrics.get("reply_count", 0),
            shares=metrics.get("retweet_count", 0),
            engagements=(
                metrics.get("like_count", 0)
                + metrics.get("reply_count", 0)
                + metrics.get("retweet_count", 0)
                + metrics.get("quote_count", 0)
            ),
            extra={
                "quote_count": metrics.get("quote_count", 0),
                "bookmark_count": metrics.get("bookmark_count", 0),
            },
        )

    def get_account_metrics(self, access_token: str, date_range: tuple[datetime, datetime]) -> AccountMetrics:
        """Fetch account-level metrics.
        
        Note: Basic implementation using profile data.
        Full analytics require Twitter Analytics API access.
        """
        profile = self.get_profile(access_token)
        
        return AccountMetrics(
            followers=profile.follower_count,
            extra={"note": "Full analytics require Twitter Analytics API access"},
        )

    # ------------------------------------------------------------------
    # Token management
    # ------------------------------------------------------------------

    def revoke_token(self, access_token: str) -> bool:
        """Revoke an OAuth token."""
        try:
            self._request(
                "POST",
                f"{API_BASE}/oauth2/revoke",
                access_token=access_token,
                data={"token": access_token},
            )
            return True
        except Exception:
            logger.exception("Failed to revoke Twitter token")
            return False
