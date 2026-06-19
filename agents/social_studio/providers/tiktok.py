"""TikTok API provider implementation."""

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

AUTH_URL = "https://www.tiktok.com/v2/auth/authorize"
TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/"
API_BASE = "https://open.tiktokapis.com/v2"


class TikTokProvider(SocialProvider):
    """TikTok API v2 provider."""

    def __init__(self, credentials: dict | None = None):
        super().__init__(credentials)

    # ------------------------------------------------------------------
    # Metadata
    # ------------------------------------------------------------------

    @property
    def platform_name(self) -> str:
        return "TikTok"

    @property
    def auth_type(self) -> AuthType:
        return AuthType.OAUTH2

    @property
    def max_caption_length(self) -> int:
        return 2200

    @property
    def supported_post_types(self) -> list[PostType]:
        return [PostType.VIDEO, PostType.SHORT]

    @property
    def supported_media_types(self) -> list[MediaType]:
        return [MediaType.MP4, MediaType.MOV]

    @property
    def required_scopes(self) -> list[str]:
        return [
            "user.info.basic",
            "video.upload",
            "video.publish",
            "video.list",
        ]

    @property
    def rate_limits(self) -> RateLimitConfig:
        return RateLimitConfig(
            requests_per_hour=100,
            requests_per_day=1000,
            publish_per_day=50,
        )

    # ------------------------------------------------------------------
    # OAuth
    # ------------------------------------------------------------------

    def get_auth_url(self, redirect_uri: str, state: str) -> str:
        params = {
            "client_key": self.credentials["client_id"],
            "scope": ",".join(self.required_scopes),
            "response_type": "code",
            "redirect_uri": redirect_uri,
            "state": state,
        }
        return f"{AUTH_URL}?{urlencode(params)}"

    def exchange_code(self, code: str, redirect_uri: str) -> OAuthTokens:
        resp = self._request(
            "POST",
            TOKEN_URL,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "client_key": self.credentials["client_id"],
                "client_secret": self.credentials["client_secret"],
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            },
        )
        body = resp.json()
        
        if "access_token" not in body:
            raise OAuthError(
                f"TikTok token exchange failed: {body}",
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
        """Refresh an expired TikTok access token."""
        resp = self._request(
            "POST",
            TOKEN_URL,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "client_key": self.credentials["client_id"],
                "client_secret": self.credentials["client_secret"],
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
        body = resp.json()
        
        if "access_token" not in body:
            raise OAuthError(
                f"TikTok token refresh failed: {body}",
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
        """Fetch TikTok user profile."""
        resp = self._request(
            "GET",
            f"{API_BASE}/user/info/",
            access_token=access_token,
            params={"fields": "open_id,union_id,avatar_url,display_name,follower_count,following_count,likes_count,video_count"},
        )
        body = resp.json()
        data = body.get("data", {}).get("user", {})

        return AccountProfile(
            platform_id=data.get("open_id", ""),
            name=data.get("display_name", ""),
            handle=data.get("username"),
            avatar_url=data.get("avatar_url"),
            follower_count=data.get("follower_count", 0),
            extra=data,
        )

    # ------------------------------------------------------------------
    # Publishing
    # ------------------------------------------------------------------

    def publish_post(self, access_token: str, content: PublishContent) -> PublishResult:
        """Publish a video to TikTok.
        
        TikTok requires a multi-step process:
        1. Initialize upload
        2. Upload video chunks
        3. Publish video
        """
        if not content.media_files and not content.media_urls:
            raise PublishError(
                "TikTok requires a video file",
                platform=self.platform_name,
            )

        # Step 1: Initialize upload
        init_resp = self._request(
            "POST",
            f"{API_BASE}/post/publish/inbox/video/init/",
            access_token=access_token,
            json={
                "source_info": {
                    "source": "FILE_UPLOAD",
                    "video_size": self._get_file_size(content.media_files[0] if content.media_files else None),
                    "chunk_size": 10 * 1024 * 1024,  # 10MB chunks
                    "total_chunk_count": 1,
                }
            },
        )
        init_data = init_resp.json()
        
        if init_data.get("error"):
            raise PublishError(
                f"TikTok upload init failed: {init_data}",
                platform=self.platform_name,
                raw_response=init_data,
            )

        publish_id = init_data.get("data", {}).get("publish_id")
        upload_url = init_data.get("data", {}).get("upload_url")

        # Step 2: Upload video
        if content.media_files:
            self._upload_video_file(upload_url, content.media_files[0])

        # Step 3: Publish
        publish_payload = {
            "post_info": {
                "title": (content.text or "")[: self.max_caption_length],
                "privacy_level": content.extra.get("privacy_level", "PUBLIC_TO_EVERYONE"),
                "disable_comment": content.extra.get("disable_comment", False),
                "disable_duet": content.extra.get("disable_duet", False),
                "disable_stitch": content.extra.get("disable_stitch", False),
                "video_cover_timestamp_ms": content.extra.get("cover_timestamp", 1000),
            },
            "source_info": {
                "source": "FILE_UPLOAD",
                "post_mode": "DIRECT_POST",
            }
        }

        publish_resp = self._request(
            "POST",
            f"{API_BASE}/post/publish/video/init/",
            access_token=access_token,
            json=publish_payload,
        )
        publish_data = publish_resp.json()

        if publish_data.get("error"):
            raise PublishError(
                f"TikTok publish failed: {publish_data}",
                platform=self.platform_name,
                raw_response=publish_data,
            )

        video_id = publish_data.get("data", {}).get("publish_id", publish_id)

        return PublishResult(
            platform_post_id=video_id,
            extra=publish_data,
        )

    def _get_file_size(self, file_path: str | None) -> int:
        """Get file size in bytes."""
        if not file_path:
            return 0
        import os
        return os.path.getsize(file_path)

    def _upload_video_file(self, upload_url: str, file_path: str) -> None:
        """Upload video file to TikTok."""
        with open(file_path, "rb") as f:
            video_data = f.read()

        self._request(
            "PUT",
            upload_url,
            headers={"Content-Type": "video/mp4"},
            data=video_data,
            timeout=300,  # 5 minutes for upload
        )

    # ------------------------------------------------------------------
    # Analytics
    # ------------------------------------------------------------------

    def get_post_metrics(self, access_token: str, post_id: str) -> PostMetrics:
        """Fetch video metrics from TikTok."""
        resp = self._request(
            "POST",
            f"{API_BASE}/video/query/",
            access_token=access_token,
            json={
                "filters": {
                    "video_ids": [post_id],
                },
            },
        )
        body = resp.json()
        videos = body.get("data", {}).get("videos", [])
        
        if not videos:
            return PostMetrics()

        video = videos[0]
        return PostMetrics(
            video_views=video.get("view_count", 0),
            likes=video.get("like_count", 0),
            comments=video.get("comment_count", 0),
            shares=video.get("share_count", 0),
            engagements=(
                video.get("like_count", 0)
                + video.get("comment_count", 0)
                + video.get("share_count", 0)
            ),
            extra=video,
        )

    def get_account_metrics(self, access_token: str, date_range: tuple[datetime, datetime]) -> AccountMetrics:
        """Fetch account metrics."""
        profile = self.get_profile(access_token)
        
        return AccountMetrics(
            followers=profile.follower_count,
            extra=profile.extra,
        )
