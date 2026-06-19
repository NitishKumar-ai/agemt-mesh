"""
Social Studio — Auto-Poster Agent
==================================
Generate platform-native content from a topic and publish (or queue) it.
Used by scheduled tasks, ideas kanban, and the /autopost API.
"""

from __future__ import annotations

import asyncio
import json
import logging
import secrets
from datetime import datetime, timezone
from typing import Optional

from events import bus

logger = logging.getLogger(__name__)

DEFAULT_BRAND_VOICE = "Professional, insightful, and authentic"


def _emit(run_id: str, event_type: str, payload: dict) -> None:
    bus.emit(json.dumps({
        "agent_id": "SocialStudioAgent",
        "event_type": event_type,
        "payload": {**payload, "run_id": run_id},
    }))


async def _autopost_one_platform(
    *,
    run_id: str,
    platform: str,
    account_id: Optional[int],
    topic: str,
    tone: str,
    voice: str,
    publish_now: bool,
) -> dict:
    from agents.social_studio.content_generator import generate_for_platform
    from agents.social_studio.publisher import publish_platform_post
    from store import (
        ss_create_posts,
        ss_get_account_token,
        ss_mark_platform_post_scheduled,
    )

    _emit(run_id, "autopost_platform_started", {
        "platform": platform,
        "status": "Writing",
    })

    gen = await generate_for_platform(platform, topic, tone, voice)
    if gen.get("status") == "failed" or not gen.get("content"):
        err = gen.get("error") or "Content generation returned empty text"
        _emit(run_id, "autopost_platform_failed", {
            "platform": platform,
            "error": err,
            "status": "Failed",
        })
        return {"platform": platform, "success": False, "error": err, "step": "write"}

    post_ids = ss_create_posts(run_id, topic, tone, [{
        "platform": platform,
        "account_id": account_id,
        "content": gen["content"],
        "hashtags": gen.get("hashtags", ""),
        "char_count": gen.get("char_count", 0),
    }])
    post_id = post_ids[0]

    if not publish_now:
        now_str = datetime.now(timezone.utc).isoformat()
        ss_mark_platform_post_scheduled(post_id, now_str)
        _emit(run_id, "autopost_platform_scheduled", {
            "platform": platform,
            "post_id": post_id,
            "status": "Scheduled",
        })
        return {
            "platform": platform,
            "success": True,
            "post_id": post_id,
            "status": "scheduled",
            "caption_preview": gen["content"][:200],
            "step": "scheduled",
        }

    token = ss_get_account_token(account_id) if account_id else None
    if not token:
        err = "No access token — reconnect your account"
        return {
            "platform": platform,
            "success": False,
            "post_id": post_id,
            "error": err,
            "step": "publish",
        }

    _emit(run_id, "autopost_platform_publishing", {
        "platform": platform,
        "status": "Publishing",
    })

    pub = publish_platform_post(
        platform_post_id=post_id,
        platform=platform,
        content=gen["content"],
        hashtags=gen.get("hashtags", ""),
        access_token=token,
        account_id=account_id,
    )
    _emit(run_id, "autopost_platform_done", {
        "platform": platform,
        "success": pub.get("success"),
        "url": pub.get("url"),
        "status": "Published" if pub.get("success") else "Failed",
    })
    return {
        "platform": platform,
        "post_id": post_id,
        "caption_preview": gen["content"][:200],
        "content": gen["content"],
        "hashtags": gen.get("hashtags", ""),
        "step": "published" if pub.get("success") else "publish",
        "external_post_id": pub.get("platform_post_id"),
        "published_at": datetime.now(timezone.utc).isoformat() if pub.get("success") else None,
        **pub,
    }


async def run_autopost(
    topic: str,
    *,
    tone: str = "professional",
    brand_voice: str = "",
    platforms: Optional[list[str]] = None,
    account_map: Optional[dict[str, int]] = None,
    publish_now: bool = True,
    run_id: Optional[str] = None,
) -> dict:
    """
    Generate content for the given topic and publish to connected accounts.
    Runs one agent per platform in parallel.

    Returns:
        {run_id, topic, results: [{platform, success, post_id, url?, error?}, ...]}
    """
    from store import ss_get_connected_accounts

    topic = (topic or "").strip()
    if not topic:
        raise ValueError("topic is required")

    # Use provided account_map or fetch accounts
    if account_map:
        acct_map = account_map
        accounts = []  # Not needed when account_map is provided
    else:
        accounts = ss_get_connected_accounts()
        if not accounts:
            raise ValueError("No connected social accounts. Connect at least one platform first.")
        acct_map = {a["platform"]: a["id"] for a in accounts}

    if platforms:
        targets = [p for p in platforms if p in acct_map]
    else:
        targets = [a["platform"] for a in accounts]

    if not targets:
        raise ValueError("No connected account for the requested platform(s)")

    run_id = run_id or f"autopost-{secrets.token_hex(8)}"
    voice = brand_voice or DEFAULT_BRAND_VOICE

    _emit(run_id, "autopost_started", {
        "topic": topic,
        "platforms": targets,
        "publish_now": publish_now,
        "status": "Generating",
    })

    results = await asyncio.gather(*[
        _autopost_one_platform(
            run_id=run_id,
            platform=platform,
            account_id=acct_map.get(platform),
            topic=topic,
            tone=tone,
            voice=voice,
            publish_now=publish_now,
        )
        for platform in targets
    ])

    all_ok = all(r.get("success") for r in results) if results else False
    _emit(run_id, "autopost_complete", {
        "topic": topic,
        "success": all_ok,
        "status": "Success" if all_ok else "Partial",
    })

    logger.info(
        "social_studio.autopost run_id=%s topic=%r platforms=%s success=%s",
        run_id, topic[:80], targets, all_ok,
    )
    return {"run_id": run_id, "topic": topic, "platforms": targets, "results": list(results)}
