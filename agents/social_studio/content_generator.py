"""
Social Studio — AI Content Generator
=====================================
Generates platform-native social media posts from a topic + brand voice
using Gemini. Designed to be called from FastAPI as an async generator so
the frontend can stream each platform's content as it arrives via SSE.

Platform rules are baked into system prompts, not left to the model's
discretion — char limits, hashtag density, CTA style, tone calibration.
"""

import asyncio
import json
import logging
import os
import re
import time
import uuid
from typing import AsyncIterator

logger = logging.getLogger(__name__)

# ── Platform content rules ──────────────────────────────────────────────────

PLATFORM_RULES: dict[str, dict] = {
    "linkedin": {
        "label": "LinkedIn",
        "char_limit": 3000,
        "hashtag_count": "3-5",
        "emoji": False,
        "prompt": (
            "Write a LinkedIn post about: {topic}\n"
            "Brand voice: {brand_voice}\n"
            "Tone: {tone}\n\n"
            "Rules:\n"
            "- Hook first line: a compelling stat, bold claim, or contrarian take\n"
            "- 3-5 short paragraphs with line breaks between each\n"
            "- Professional but human — no corporate buzzwords\n"
            "- Clear CTA in the last line (ask a question or invite comments)\n"
            "- End with 3-5 relevant hashtags on their own line\n"
            "- Max 3000 characters total\n"
            "- No emojis unless the brand voice is explicitly casual\n"
            "Output only the post text, no preamble."
        ),
    },
    "linkedin_company": {
        "label": "LinkedIn (Company)",
        "char_limit": 3000,
        "hashtag_count": "3-5",
        "emoji": False,
        "prompt": (
            "Write a LinkedIn Company Page post about: {topic}\n"
            "Brand voice: {brand_voice}\n"
            "Tone: {tone}\n\n"
            "Rules:\n"
            "- Hook first line: industry insight, data point, or bold company perspective\n"
            "- 3-5 short paragraphs with line breaks between each\n"
            "- Authoritative company voice — helpful, not salesy\n"
            "- Clear CTA in the last line\n"
            "- End with 3-5 relevant hashtags on their own line\n"
            "- Max 3000 characters total\n"
            "Output only the post text, no preamble."
        ),
    },
    "facebook": {
        "label": "Facebook",
        "char_limit": 5000,
        "hashtag_count": "3-5",
        "emoji": True,
        "prompt": (
            "Write a Facebook post about: {topic}\n"
            "Brand voice: {brand_voice}\n"
            "Tone: {tone}\n\n"
            "Rules:\n"
            "- Start with an attention-grabbing hook that stops the scroll\n"
            "- 2-4 conversational paragraphs with line breaks\n"
            "- Community-focused and engaging — build connection\n"
            "- 1-2 emojis for personality (don't overdo it)\n"
            "- Strong CTA: ask a question, encourage sharing, or invite reactions\n"
            "- End with 3-5 hashtags on their own line\n"
            "- Max 5000 characters (though 300-500 performs best)\n"
            "Output only the post text, no preamble."
        ),
    },
    "instagram": {
        "label": "Instagram",
        "char_limit": 2200,
        "hashtag_count": "8-10",
        "emoji": True,
        "prompt": (
            "Write an Instagram caption about: {topic}\n"
            "Brand voice: {brand_voice}\n"
            "Tone: {tone}\n\n"
            "Rules:\n"
            "- First sentence must stop the scroll — bold claim or hook question\n"
            "- Tell a micro-story or share an insight in 100-150 words\n"
            "- Add 1-2 tasteful emojis for visual breaks (not excessive)\n"
            "- Clear CTA: save, share, comment, or 'link in bio'\n"
            "- Two blank lines, then 8-10 niche-specific hashtags\n"
            "- Max 2200 characters total\n"
            "Output only the caption text, no preamble."
        ),
    },
    "instagram_login": {
        "label": "Instagram (Direct)",
        "char_limit": 2200,
        "hashtag_count": "8-10",
        "emoji": True,
        "prompt": (
            "Write an Instagram caption about: {topic}\n"
            "Brand voice: {brand_voice}\n"
            "Tone: {tone}\n\n"
            "Rules:\n"
            "- First sentence must stop the scroll — bold claim or hook question\n"
            "- Tell a micro-story or share an insight in 100-150 words\n"
            "- Add 1-2 tasteful emojis for visual breaks (not excessive)\n"
            "- Clear CTA: save, share, comment, or 'link in bio'\n"
            "- Two blank lines, then 8-10 niche-specific hashtags\n"
            "- Max 2200 characters total\n"
            "Output only the caption text, no preamble."
        ),
    },
    "threads": {
        "label": "Threads",
        "char_limit": 500,
        "hashtag_count": "0-2",
        "emoji": True,
        "prompt": (
            "Write a Threads post about: {topic}\n"
            "Brand voice: {brand_voice}\n"
            "Tone: {tone}\n\n"
            "Rules:\n"
            "- Max 500 characters — be ruthlessly concise\n"
            "- Conversational, like texting a smart friend\n"
            "- One clear idea, fully expressed\n"
            "- 0-2 hashtags max (or none if they feel forced)\n"
            "- Can end with a question to spark replies\n"
            "- No corporate-speak\n"
            "Output only the post text, no preamble."
        ),
    },
    "bluesky": {
        "label": "Bluesky",
        "char_limit": 300,
        "hashtag_count": "0-1",
        "emoji": False,
        "prompt": (
            "Write a Bluesky post about: {topic}\n"
            "Brand voice: {brand_voice}\n"
            "Tone: {tone}\n\n"
            "Rules:\n"
            "- Max 300 characters — every word earns its place\n"
            "- Witty, original, or genuinely insightful\n"
            "- Bluesky rewards authenticity over polish\n"
            "- 0-1 hashtag\n"
            "- Can end with a short question\n"
            "Output only the post text, no preamble."
        ),
    },
    "twitter": {
        "label": "Twitter / X",
        "char_limit": 280,
        "hashtag_count": "1-2",
        "emoji": False,
        "prompt": (
            "Write a tweet about: {topic}\n"
            "Brand voice: {brand_voice}\n"
            "Tone: {tone}\n\n"
            "Rules:\n"
            "- Max 280 characters\n"
            "- Punchy, hook-first — first 5 words must earn the click\n"
            "- No fluff, no 'thread incoming'\n"
            "- 1-2 hashtags max\n"
            "- End with a question or strong statement\n"
            "Output only the tweet text, no preamble."
        ),
    },
}

# ── Helpers ─────────────────────────────────────────────────────────────────

def _extract_hashtags(text: str) -> tuple[str, str]:
    """Split content into (body, hashtag_string)."""
    hashtag_pattern = r'((?:#\w+\s*)+)$'
    match = re.search(hashtag_pattern, text.strip(), re.MULTILINE)
    if match:
        hashtags = match.group(0).strip()
        body = text[:match.start()].strip()
        return body, hashtags
    return text.strip(), ""


def _truncate_to_limit(text: str, limit: int) -> str:
    """Hard-truncate at word boundary if over char limit."""
    if len(text) <= limit:
        return text
    truncated = text[:limit]
    last_space = truncated.rfind(" ")
    if last_space > limit * 0.8:
        truncated = truncated[:last_space]
    return truncated.rstrip() + "…"


# ── LLM call (LiteLLM — same stack as the rest of Agent Mesh) ───────────────

from llm_models import resolve_gemini_model


def _llm_model() -> str:
    return resolve_gemini_model()


async def _generate_text(prompt: str) -> str:
    """Call Gemini via LiteLLM (no google-generativeai package required)."""
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY or GOOGLE_API_KEY not set in .env")

    def _call() -> str:
        import litellm
        model = _llm_model()
        logger.info("social_studio.llm model=%s", model)
        response = litellm.completion(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1024,
            temperature=0.85,
            api_key=api_key,
        )
        text = response.choices[0].message.content
        if not text or not str(text).strip():
            raise RuntimeError("Empty response from model")
        return str(text).strip()

    return await asyncio.get_event_loop().run_in_executor(None, _call)


# ── Core generation function ────────────────────────────────────────────────

async def generate_for_platform(
    platform: str,
    topic: str,
    tone: str,
    brand_voice: str,
    generate_image: bool = False,
) -> dict:
    """
    Generate content for a single platform using Gemini.
    Returns dict with: platform, content, hashtags, char_count, status, image_url (optional)
    """
    try:
        rules = PLATFORM_RULES.get(platform)
        if not rules:
            raise ValueError(f"Unknown platform: {platform}")

        prompt = rules["prompt"].format(
            topic=topic,
            tone=tone,
            brand_voice=brand_voice or "Professional and helpful",
        )

        t0 = time.time()
        raw = await _generate_text(prompt)
        elapsed_ms = int((time.time() - t0) * 1000)
        limit = rules["char_limit"]
        raw = _truncate_to_limit(raw, limit)
        body, hashtags = _extract_hashtags(raw)

        logger.info(
            "social_studio.generate platform=%s chars=%d elapsed_ms=%d",
            platform, len(raw), elapsed_ms
        )

        result = {
            "platform": platform,
            "label": rules["label"],
            "content": body,
            "hashtags": hashtags,
            "char_count": len(body) + (len(hashtags) + 2 if hashtags else 0),
            "char_limit": limit,
            "status": "draft",
            "error": None,
        }

        # Generate image if requested and for visual platforms
        if generate_image and platform in ("instagram_login", "facebook", "twitter", "linkedin"):
            from .imagen_client import generate_image, is_imagen_enabled
            import os
            import secrets
            
            if is_imagen_enabled():
                try:
                    # Create image prompt from topic
                    image_prompt = f"Create a professional, eye-catching social media image about: {topic}. Style: modern, clean, vibrant colors. No text in image."
                    
                    # Generate unique filename
                    filename = f"social_studio_{platform}_{secrets.token_hex(8)}.png"
                    output_path = os.path.join("generated_images", filename)
                    
                    # Generate image
                    img_result = generate_image(image_prompt, output_path)
                    
                    if img_result.get("status") == "complete":
                        result["image_url"] = f"/generated_images/{filename}"
                        result["image_path"] = output_path
                        logger.info(f"social_studio.image_generated platform={platform} path={output_path}")
                    else:
                        logger.warning(f"social_studio.image_failed platform={platform} error={img_result.get('message')}")
                except Exception as img_err:
                    logger.error(f"social_studio.image_error platform={platform} error={img_err}")

        return result

    except Exception as e:
        logger.error("social_studio.generate_failed platform=%s error=%s", platform, e)
        return {
            "platform": platform,
            "label": PLATFORM_RULES.get(platform, {}).get("label", platform),
            "content": "",
            "hashtags": "",
            "char_count": 0,
            "char_limit": PLATFORM_RULES.get(platform, {}).get("char_limit", 280),
            "status": "failed",
            "error": str(e),
        }


async def generate_all_platforms(
    topic: str,
    tone: str,
    brand_voice: str,
    platforms: list[str],
    generate_image: bool = False,
) -> AsyncIterator[dict]:
    """
    Async generator that yields results for each platform as they complete.
    Use with SSE: yield each result as a server-sent event.
    """
    tasks = {
        platform: asyncio.create_task(
            generate_for_platform(platform, topic, tone, brand_voice, generate_image)
        )
        for platform in platforms
    }

    for platform, task in tasks.items():
        result = await task
        yield result


async def run_content_generation(
    run_id: str,
    topic: str,
    tone: str,
    brand_voice: str,
    platforms: list[str],
    account_map: dict[str, int],  # platform -> account_id
) -> list[dict]:
    """
    Run full generation for all platforms and return results list.
    Writes results to store via the ss_create_platform_posts function.
    Called by the API endpoint after creating the parent post row.
    """
    from store import ss_create_platform_posts, ss_mark_platform_post_failed

    results = []
    tasks = [
        generate_for_platform(p, topic, tone, brand_voice)
        for p in platforms
    ]
    platform_results = await asyncio.gather(*tasks, return_exceptions=True)

    posts_to_create = []
    for platform, result in zip(platforms, platform_results):
        if isinstance(result, Exception):
            result = {
                "platform": platform,
                "content": "",
                "hashtags": "",
                "char_count": 0,
                "status": "failed",
                "error": str(result),
            }
        posts_to_create.append({
            "platform": platform,
            "account_id": account_map.get(platform),
            "caption": result.get("content", ""),
            "hashtags": result.get("hashtags", ""),
            "char_count": result.get("char_count", 0),
            "status": result.get("status", "draft"),
            "publish_error": result.get("error"),
        })
        results.append(result)

    ss_create_platform_posts(run_id, posts_to_create)
    return results
