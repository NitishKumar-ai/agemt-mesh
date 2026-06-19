"""
Social Studio — Publisher
==========================
Calls the correct platform provider to publish a post.
Writes a PublishLog entry for every attempt (success or failure).
Handles retry-backoff state via next_retry_at.
"""

import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# How long to wait before each retry attempt (seconds)
RETRY_DELAYS = [60, 300, 900, 3600]  # 1m, 5m, 15m, 1h


def _get_provider(platform: str, credentials: dict):
    """Instantiate the right provider for a platform."""
    from .providers import PROVIDERS
    cls = PROVIDERS.get(platform)
    if not cls:
        raise ValueError(f"No provider registered for platform: {platform}")
    return cls(credentials=credentials)


def _platform_credentials(platform: str, account_id: Optional[int] = None) -> dict:
    import os
    creds: dict = {}
    if platform in ("linkedin", "linkedin_company"):
        creds["client_id"] = os.environ.get("LINKEDIN_CLIENT_ID", "")
        creds["client_secret"] = os.environ.get("LINKEDIN_CLIENT_SECRET", "")
    if platform == "linkedin_company" and account_id:
        from store import ss_get_account
        acct = ss_get_account(account_id)
        if acct and acct.get("account_id"):
            creds["org_id"] = acct["account_id"]
    if platform == "facebook" and account_id:
        # Pass page_id from stored account
        from store import ss_get_account
        acct = ss_get_account(account_id)
        if acct and acct.get("account_id"):
            creds["page_id"] = acct["account_id"]
            import logging
            logging.getLogger(__name__).info(f"Facebook page_id retrieved: {creds['page_id']}")
        else:
            import logging
            logging.getLogger(__name__).warning(f"Facebook account_id not found for account {account_id}. Account data: {acct}")
    if platform == "instagram_login":
        creds["client_id"] = os.environ.get("INSTAGRAM_LOGIN_APP_ID", "")
        creds["client_secret"] = os.environ.get("INSTAGRAM_LOGIN_APP_SECRET", "")
    if platform == "youtube":
        creds["client_id"] = os.environ.get("PLATFORM_GOOGLE_CLIENT_ID", "")
        creds["client_secret"] = os.environ.get("PLATFORM_GOOGLE_CLIENT_SECRET", "")
    return creds


def publish_platform_post(
    platform_post_id: int,
    platform: str,
    content: str,
    hashtags: str,
    access_token: str,
    platform_credentials: Optional[dict] = None,
    account_id: Optional[int] = None,
) -> dict:
    """
    Publish a single platform post.

    Returns:
        {"success": bool, "platform_post_id": str, "url": str, "error": str}
    """
    from store import (
        ss_mark_platform_post_published,
        ss_mark_platform_post_failed,
        ss_log_publish_attempt,
        ss_increment_retry,
    )
    from .providers.types import PublishContent, PostType

    full_text = content
    if hashtags:
        full_text = f"{content}\n\n{hashtags}"

    # Get platform credentials (either passed or computed)
    creds = platform_credentials or _platform_credentials(platform, account_id)
    provider = _get_provider(platform, creds)
    
    # Build payload with platform-specific extras
    payload_extra = {}
    if platform == "facebook" and "page_id" in creds:
        payload_extra["page_id"] = creds["page_id"]
    
    payload = PublishContent(text=full_text, post_type=PostType.TEXT, extra=payload_extra)

    t0 = time.time()
    status_code = None
    response_body = ""
    error_message = ""
    attempt_number = 1

    try:
        result = provider.publish_post(access_token=access_token, content=payload)
        duration_ms = int((time.time() - t0) * 1000)
        status_code = 200

        ss_log_publish_attempt(
            platform_post_id=platform_post_id,
            attempt_number=attempt_number,
            status_code=status_code,
            response_body="",
            error_message="",
            duration_ms=duration_ms,
        )
        ss_mark_platform_post_published(
            platform_post_id,
            result.platform_post_id,
            result.url,
        )

        logger.info(
            "social_studio.published platform=%s ext_id=%s duration_ms=%d",
            platform, result.platform_post_id, duration_ms,
        )
        return {
            "success": True,
            "platform_post_id": result.platform_post_id,
            "url": result.url,
            "error": None,
        }

    except Exception as e:
        duration_ms = int((time.time() - t0) * 1000)
        error_message = str(e)[:500]

        # Determine retry eligibility
        from .providers.exceptions import ProviderError
        retryable = True
        if isinstance(e, ProviderError):
            retryable = e.retryable
            status_code = getattr(e, "status_code", None)

        ss_log_publish_attempt(
            platform_post_id=platform_post_id,
            attempt_number=attempt_number,
            status_code=status_code or 0,
            response_body=response_body[:1000],
            error_message=error_message,
            duration_ms=duration_ms,
        )

        if retryable:
            retry_count = ss_increment_retry(platform_post_id)
            delay = RETRY_DELAYS[min(retry_count - 1, len(RETRY_DELAYS) - 1)]
            next_retry = (
                datetime.now(timezone.utc) + timedelta(seconds=delay)
            ).isoformat()
            ss_mark_platform_post_failed(
                platform_post_id,
                error_message,
                retryable=True,
                next_retry_at=next_retry,
            )
        else:
            ss_mark_platform_post_failed(
                platform_post_id,
                error_message,
                retryable=False,
                next_retry_at=None,
            )

        logger.error(
            "social_studio.publish_failed platform=%s error=%s retryable=%s",
            platform, error_message, retryable,
        )
        return {"success": False, "platform_post_id": None, "url": None, "error": error_message}
