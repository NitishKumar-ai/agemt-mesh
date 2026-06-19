"""Facebook Graph API provider implementation."""

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

BASE_URL = "https://graph.facebook.com/v21.0"
OAUTH_URL = "https://www.facebook.com/v21.0/dialog/oauth"
TOKEN_URL = f"{BASE_URL}/oauth/access_token"


class FacebookProvider(SocialProvider):
    """Facebook Graph API provider."""

    def __init__(self, credentials: dict | None = None):
        creds = dict(credentials or {})
        if "app_id" in creds and "client_id" not in creds:
            creds["client_id"] = creds.pop("app_id")
        if "app_secret" in creds and "client_secret" not in creds:
            creds["client_secret"] = creds.pop("app_secret")
        super().__init__(creds)

    # ------------------------------------------------------------------
    # Metadata
    # ------------------------------------------------------------------

    @property
    def platform_name(self) -> str:
        return "Facebook"

    @property
    def auth_type(self) -> AuthType:
        return AuthType.OAUTH2

    @property
    def max_caption_length(self) -> int:
        return 63206  # Facebook has very high limit

    @property
    def supported_post_types(self) -> list[PostType]:
        return [PostType.TEXT, PostType.IMAGE, PostType.VIDEO, PostType.LINK]

    @property
    def supported_media_types(self) -> list[MediaType]:
        return [MediaType.JPEG, MediaType.PNG, MediaType.GIF, MediaType.MP4, MediaType.MOV]

    @property
    def required_scopes(self) -> list[str]:
        # Facebook permissions for posting and managing Pages
        # See: https://developers.facebook.com/docs/permissions/reference
        return [
            "pages_show_list",           # View list of Pages managed by user
            "pages_read_engagement",     # Read engagement data from Pages  
            "pages_manage_posts",        # Create, edit and delete Page posts
            "public_profile",            # Basic profile info
        ]

    @property
    def rate_limits(self) -> RateLimitConfig:
        return RateLimitConfig(
            requests_per_hour=200,
            requests_per_day=5000,
            publish_per_day=200,
        )

    # ------------------------------------------------------------------
    # OAuth
    # ------------------------------------------------------------------

    def get_auth_url(self, redirect_uri: str, state: str) -> str:
        params = {
            "client_id": self.credentials["client_id"],
            "redirect_uri": redirect_uri,
            "state": state,
            "scope": ",".join(self.required_scopes),
            "response_type": "code",
        }
        return f"{OAUTH_URL}?{urlencode(params)}"

    def exchange_code(self, code: str, redirect_uri: str) -> OAuthTokens:
        resp = self._request(
            "GET",
            TOKEN_URL,
            params={
                "client_id": self.credentials["client_id"],
                "client_secret": self.credentials["client_secret"],
                "code": code,
                "redirect_uri": redirect_uri,
            },
        )
        data = resp.json()
        
        if "access_token" not in data:
            raise OAuthError(
                "Facebook token exchange failed",
                platform=self.platform_name,
                raw_response=data,
            )

        return OAuthTokens(
            access_token=data["access_token"],
            expires_in=data.get("expires_in"),
            token_type=data.get("token_type", "Bearer"),
            raw_response=data,
        )

    def refresh_token(self, short_lived_token: str) -> OAuthTokens:
        """Exchange short-lived token for long-lived one."""
        resp = self._request(
            "GET",
            TOKEN_URL,
            params={
                "grant_type": "fb_exchange_token",
                "client_id": self.credentials["client_id"],
                "client_secret": self.credentials["client_secret"],
                "fb_exchange_token": short_lived_token,
            },
        )
        data = resp.json()
        
        if "access_token" not in data:
            raise OAuthError(
                "Facebook long-lived token exchange failed",
                platform=self.platform_name,
                raw_response=data,
            )

        return OAuthTokens(
            access_token=data["access_token"],
            expires_in=data.get("expires_in"),
            token_type=data.get("token_type", "Bearer"),
            raw_response=data,
        )

    # ------------------------------------------------------------------
    # Profile
    # ------------------------------------------------------------------

    def get_profile(self, access_token: str) -> AccountProfile:
        """Get Facebook Page profile (not personal profile)."""
        # Get pages managed by the user WITH their page access tokens
        resp = self._request(
            "GET",
            f"{BASE_URL}/me/accounts",
            access_token=access_token,
            params={"fields": "id,name,username,picture,fan_count,access_token"},
        )
        
        pages = resp.json().get("data", [])
        if not pages:
            raise PublishError(
                "No Facebook Pages found. You need to manage at least one Page.",
                platform=self.platform_name,
            )

        # Use the first page
        page = pages[0]
        picture_url = page.get("picture", {}).get("data", {}).get("url")
        
        # IMPORTANT: Store the Page access token in extra
        # This is needed for publishing (user token can't post to Pages)
        page_access_token = page.get("access_token")

        return AccountProfile(
            platform_id=page["id"],
            name=page.get("name", ""),
            handle=page.get("username"),
            avatar_url=picture_url,
            follower_count=page.get("fan_count", 0),
            extra={
                "pages": pages,
                "page_access_token": page_access_token,  # Store for publishing
            },
        )

    # ------------------------------------------------------------------
    # Publishing
    # ------------------------------------------------------------------

    def publish_post(self, access_token: str, content: PublishContent) -> PublishResult:
        """Publish a post to Facebook Page.
        
        The access_token should be a Page token (not user token).
        The page_id should be provided in content.extra['page_id'].
        """
        page_id = content.extra.get("page_id")
        if not page_id:
            raise PublishError(
                "Facebook Page ID not provided. Reconnect your Facebook account.",
                platform=self.platform_name,
            )

        payload: dict = {}
        
        if content.text:
            payload["message"] = content.text

        # Handle different post types
        if content.post_type == PostType.LINK and content.link_url:
            payload["link"] = content.link_url
            endpoint = f"{BASE_URL}/{page_id}/feed"
        elif content.post_type == PostType.IMAGE and content.media_urls:
            payload["url"] = content.media_urls[0]
            endpoint = f"{BASE_URL}/{page_id}/photos"
        elif content.post_type == PostType.VIDEO and content.media_urls:
            payload["file_url"] = content.media_urls[0]
            endpoint = f"{BASE_URL}/{page_id}/videos"
        else:
            # Default text post
            endpoint = f"{BASE_URL}/{page_id}/feed"

        resp = self._request(
            "POST",
            endpoint,
            access_token=access_token,
            json=payload,
        )
        body = resp.json()
        post_id = body.get("id", "")

        if not post_id:
            raise PublishError(
                f"Facebook publish failed: {body}",
                platform=self.platform_name,
                raw_response=body,
            )

        # Construct post URL
        post_url = f"https://www.facebook.com/{post_id.replace('_', '/posts/')}"

        return PublishResult(
            platform_post_id=post_id,
            url=post_url,
            extra=body,
        )

    # ------------------------------------------------------------------
    # Analytics
    # ------------------------------------------------------------------

    def get_post_metrics(self, access_token: str, post_id: str) -> PostMetrics:
        """Fetch engagement metrics for a Facebook post."""
        resp = self._request(
            "GET",
            f"{BASE_URL}/{post_id}",
            access_token=access_token,
            params={
                "fields": "insights.metric(post_impressions,post_engaged_users,post_reactions_by_type_total,post_clicks)",
            },
        )
        body = resp.json()
        insights = body.get("insights", {}).get("data", [])

        metrics_data: dict = {}
        for insight in insights:
            name = insight.get("name", "")
            values = insight.get("values", [])
            if values:
                metrics_data[name] = values[0].get("value", 0)

        reactions = metrics_data.get("post_reactions_by_type_total", {})
        total_reactions = sum(reactions.values()) if isinstance(reactions, dict) else 0

        return PostMetrics(
            impressions=metrics_data.get("post_impressions", 0),
            engagements=metrics_data.get("post_engaged_users", 0),
            likes=total_reactions,
            clicks=metrics_data.get("post_clicks", 0),
            extra={"reactions_breakdown": reactions},
        )

    def get_account_metrics(self, access_token: str, date_range: tuple[datetime, datetime]) -> AccountMetrics:
        """Fetch Page-level metrics."""
        page_id = self.credentials.get("page_id", "me")
        
        resp = self._request(
            "GET",
            f"{BASE_URL}/{page_id}",
            access_token=access_token,
            params={
                "fields": "fan_count,insights.metric(page_impressions,page_engaged_users).since({}).until({})".format(
                    int(date_range[0].timestamp()),
                    int(date_range[1].timestamp()),
                ),
            },
        )
        body = resp.json()
        insights = body.get("insights", {}).get("data", [])

        metrics_data: dict = {}
        for insight in insights:
            name = insight.get("name", "")
            values = insight.get("values", [])
            if values:
                total = sum(v.get("value", 0) for v in values)
                metrics_data[name] = total

        return AccountMetrics(
            followers=body.get("fan_count", 0),
            impressions=metrics_data.get("page_impressions", 0),
            engagements=metrics_data.get("page_engaged_users", 0),
            extra=metrics_data,
        )
