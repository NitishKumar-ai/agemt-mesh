"""
Social Studio — Analytics Sync
================================
Pulls metrics from connected platform accounts and writes
daily metric-key snapshots into ss_metric_snapshots.

Metric keys (matching brightbean's AccountInsightsSnapshot):
  followers, followers_gained, impressions, reach, engagements,
  likes, comments, shares, saves, profile_views, avg_engagement_rate
"""

import logging
from datetime import date, datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# ── Metric keys we track per platform ───────────────────────────────────────

ACCOUNT_METRICS = [
    "followers", "followers_gained", "impressions",
    "reach", "engagements", "profile_views", "avg_engagement_rate",
]

PLATFORM_SUPPORTED_METRICS: dict[str, list[str]] = {
    "bluesky": ["followers"],
    "linkedin": ["followers", "impressions", "reach", "engagements"],
    "instagram": ["followers", "impressions", "reach", "engagements", "saves", "profile_views"],
    "threads": ["followers", "impressions", "reach", "engagements"],
    "twitter": ["followers", "impressions", "engagements", "profile_views"],
}


def sync_account_analytics(account_id: int, platform: str, access_token: str) -> dict:
    """
    Pull latest metrics for one account and write snapshots.
    Returns a summary dict of what was stored.
    """
    from store import ss_upsert_metric_snapshot, ss_update_follower_count

    today = date.today().isoformat()
    stored = {}

    try:
        metrics = _fetch_platform_metrics(platform, access_token)
        for key, value in metrics.items():
            if key in PLATFORM_SUPPORTED_METRICS.get(platform, []):
                ss_upsert_metric_snapshot(
                    account_id=account_id,
                    metric_key=key,
                    date=today,
                    value=float(value),
                )
                stored[key] = value

        # Update the denormalized follower_count on the account row
        if "followers" in stored:
            ss_update_follower_count(account_id, int(stored["followers"]))

        logger.info(
            "social_studio.analytics_sync account_id=%d platform=%s metrics=%s",
            account_id, platform, list(stored.keys()),
        )
        return {"account_id": account_id, "platform": platform, "stored": stored, "error": None}

    except Exception as e:
        logger.error(
            "social_studio.analytics_sync_failed account_id=%d platform=%s error=%s",
            account_id, platform, e,
        )
        return {"account_id": account_id, "platform": platform, "stored": {}, "error": str(e)}


def _fetch_platform_metrics(platform: str, access_token: str) -> dict:
    """Dispatch to the right provider and extract metrics dict."""
    from agents.social_studio.providers import PROVIDERS
    from agents.social_studio.providers.types import AccountMetrics
    from datetime import timedelta

    cls = PROVIDERS.get(platform)
    if not cls:
        return {}

    provider = cls()
    now = datetime.now(timezone.utc)
    date_range = (now - timedelta(days=7), now)

    metrics: dict = {}

    # Always get profile for follower count
    try:
        profile = provider.get_profile(access_token)
        metrics["followers"] = profile.follower_count
    except Exception:
        pass

    # Get engagement metrics where supported
    try:
        acct_metrics: AccountMetrics = provider.get_account_metrics(access_token, date_range)
        metrics["followers_gained"] = acct_metrics.followers_gained
        metrics["impressions"] = acct_metrics.impressions
        metrics["reach"] = acct_metrics.reach
        metrics["engagements"] = acct_metrics.engagements
        metrics["profile_views"] = acct_metrics.profile_views
        # Engagement rate: engagements / impressions * 100
        if acct_metrics.impressions > 0:
            metrics["avg_engagement_rate"] = round(
                (acct_metrics.engagements / acct_metrics.impressions) * 100, 2
            )
    except NotImplementedError:
        pass  # Provider doesn't support analytics — follower count is enough
    except Exception as e:
        logger.warning("analytics_fetch_partial platform=%s error=%s", platform, e)

    return metrics


def sync_all_accounts() -> list[dict]:
    """Sync analytics for every active account. Called by background task or API endpoint."""
    from store import ss_list_accounts, ss_get_account_token

    accounts = ss_list_accounts()
    results = []
    for acct in accounts:
        token = ss_get_account_token(acct["id"])
        if not token:
            continue
        result = sync_account_analytics(
            account_id=acct["id"],
            platform=acct["platform"],
            access_token=token,
        )
        results.append(result)
    return results
