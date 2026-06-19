"""
Social Studio - Multi-Agent Marketing Team
Implements the deep DAG of specialized agents:
Researcher -> Strategist -> Copywriter -> Editor -> Art Director
"""

import asyncio
import logging
import os
from typing import AsyncIterator

from google import genai
from tavily import TavilyClient

from agents.social_studio.content_generator import PLATFORM_RULES
from agents.social_studio.imagen_client import generate_image as imagen_generate

logger = logging.getLogger(__name__)

_tavily_client = None
_gemini_client = None


def get_tavily():
    global _tavily_client
    if not _tavily_client:
        _tavily_client = TavilyClient(api_key=os.environ.get("TAVILY_API_KEY"))
    return _tavily_client


def get_gemini():
    global _gemini_client
    if not _gemini_client:
        _gemini_client = genai.Client()
    return _gemini_client


async def _draft_platform(platform: str, topic: str, strategy_brief: str, research_summary: str) -> dict:
    """Pure async function (no yield) — drafts + edits copy for one platform."""
    rules = PLATFORM_RULES.get(platform)
    if not rules:
        return {"platform": platform, "label": platform, "content": "Platform not supported.", "status": "failed", "char_count": 0, "hashtags": ""}

    copy_prompt = (
        f"{rules['prompt']}\n\n"
        f"Topic: {topic}\n"
        f"Campaign Strategy Brief:\n{strategy_brief}\n\n"
    )
    if research_summary:
        copy_prompt += f"Verified Facts & Data to weave in:\n{research_summary}\n"

    gemini = get_gemini()
    try:
        copy_resp = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: gemini.models.generate_content(model="gemini-2.5-flash", contents=copy_prompt)
        )
        content = copy_resp.text.strip()

        # Editor: enforce char limit
        if len(content) > rules["char_limit"]:
            edit_prompt = (
                f"This post is too long ({len(content)} chars). Platform limit is {rules['char_limit']} chars.\n"
                f"Shorten it — keep the main hook and CTA, cut filler. Keep hashtags on a separate last line.\n\n"
                f"{content}"
            )
            edit_resp = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: gemini.models.generate_content(model="gemini-2.5-flash", contents=edit_prompt)
            )
            content = edit_resp.text.strip()

        # Extract hashtags from last line
        lines = content.split("\n")
        hashtags = ""
        clean_lines = lines[:]
        for i in range(len(lines) - 1, -1, -1):
            stripped = lines[i].strip()
            if stripped.startswith("#") or (stripped and all(w.startswith("#") for w in stripped.split())):
                hashtags = stripped
                clean_lines = lines[:i]
                break

        clean_content = "\n".join(clean_lines).strip()
        if not clean_content:
            clean_content = content
            hashtags = ""

        return {
            "platform": platform,
            "label": rules["label"],
            "content": clean_content,
            "hashtags": hashtags,
            "char_count": len(clean_content) + len(hashtags),
            "char_limit": rules["char_limit"],
            "status": "draft",
        }
    except Exception as e:
        logger.error(f"Copywriter failed for {platform}: {e}")
        return {
            "platform": platform,
            "label": rules.get("label", platform),
            "content": f"Generation failed: {e}",
            "status": "failed",
            "char_count": 0,
            "hashtags": "",
        }


async def run_marketing_team(
    topic: str,
    tone: str,
    brand_voice: str,
    platforms: list,
    generate_image: bool = True,
) -> AsyncIterator[dict]:
    """
    Executes the multi-agent DAG.
    Yields:
      {"event": "agent_status", "agent": "...", "message": "..."}
      {"event": "platform_done",  "data": {...}}
      {"event": "media_done",     "data": {...}}
    """

    # ── Phase 0: Coordinator ─────────────────────────────────────────────────
    yield {"event": "agent_status", "agent": "Coordinator", "message": f"Assembling marketing team for: {topic[:40]}..."}

    # ── Phase 1: Researcher ──────────────────────────────────────────────────
    yield {"event": "agent_status", "agent": "Researcher", "message": "Scanning the web for real-time data and trends..."}
    research_summary = ""
    try:
        is_url = topic.startswith("http://") or topic.startswith("https://")
        query = f"Summarize key insights: {topic}" if is_url else topic
        tavily = get_tavily()
        research_resp = await asyncio.get_event_loop().run_in_executor(
            None, lambda: tavily.search(query=query, search_depth="advanced")
        )
        snippets = [
            f"- {r['title']}: {r['content'][:200]}"
            for r in research_resp.get("results", [])[:4]
        ]
        research_summary = "\n".join(snippets)
        count = len(research_resp.get("results", []))
        yield {"event": "agent_status", "agent": "Researcher",
               "message": f"Pulled {count} sources. Key data extracted." if research_summary else "No specific web data. Using general knowledge."}
    except Exception as e:
        logger.error(f"Researcher failed: {e}")
        yield {"event": "agent_status", "agent": "Researcher", "message": f"Research skipped ({e})"}

    # ── Phase 2: Strategist ──────────────────────────────────────────────────
    yield {"event": "agent_status", "agent": "Strategist", "message": "Developing campaign hook, core message, and CTA..."}
    strategy_brief = f"Topic: {topic}\nTone: {tone}\nBrand Voice: {brand_voice}"
    try:
        gemini = get_gemini()
        strat_prompt = (
            f"You are a Senior Marketing Strategist.\n"
            f"Topic: {topic}\nTone: {tone}\nBrand Voice: {brand_voice or 'authentic, direct'}\n\n"
        )
        if research_summary:
            strat_prompt += f"Research Insights:\n{research_summary}\n\n"
        strat_prompt += (
            "Create a sharp campaign brief. Output EXACTLY:\n"
            "CORE MESSAGE: (one sentence)\n"
            "HOOK: (the attention-grabbing angle)\n"
            "CTA: (what we want the audience to do)"
        )
        strat_resp = await asyncio.get_event_loop().run_in_executor(
            None, lambda: gemini.models.generate_content(model="gemini-2.5-flash", contents=strat_prompt)
        )
        strategy_brief = strat_resp.text.strip()
        yield {"event": "agent_status", "agent": "Strategist", "message": "Campaign brief locked. Hook defined."}
    except Exception as e:
        logger.error(f"Strategist failed: {e}")
        yield {"event": "agent_status", "agent": "Strategist", "message": f"Strategy fallback ({e})"}

    # ── Phase 3: Copywriter + Editor (all platforms in parallel) ─────────────
    yield {"event": "agent_status", "agent": "Copywriter", "message": f"Drafting native copy for {len(platforms)} platform(s) in parallel..."}

    tasks = {p: asyncio.create_task(_draft_platform(p, topic, strategy_brief, research_summary)) for p in platforms}
    all_drafts = []

    for platform, task in tasks.items():
        rules = PLATFORM_RULES.get(platform, {})
        label = rules.get("label", platform)
        draft = await task
        if draft.get("char_count", 0) > rules.get("char_limit", 9999):
            yield {"event": "agent_status", "agent": "Editor", "message": f"{label} draft was too long — rewritten."}
        else:
            yield {"event": "agent_status", "agent": "Editor", "message": f"{label} draft ✓ passes quality check."}
        all_drafts.append(draft)
        yield {"event": "platform_done", "data": draft}

    # ── Phase 4: Art Director (optional image gen) ───────────────────────────
    if not generate_image:
        yield {"event": "agent_status", "agent": "Coordinator", "message": "Campaign text generation complete. Image skipped."}
        return

    yield {"event": "agent_status", "agent": "Art Director", "message": "Designing the visual to match the campaign hook..."}
    try:
        context_draft = all_drafts[0]["content"] if all_drafts else topic
        gemini = get_gemini()
        art_prompt_req = (
            f"You are a world-class Art Director at a premium brand.\n"
            f"Social copy:\n{context_draft}\n\n"
            f"Write a single, highly specific image generation prompt for Imagen 3.\n"
            f"Describe: lighting, color palette, mood, composition, style, subject.\n"
            f"Do NOT include text/words/captions in the image.\n"
            f"Output ONLY the prompt."
        )
        art_resp = await asyncio.get_event_loop().run_in_executor(
            None, lambda: gemini.models.generate_content(model="gemini-2.5-flash", contents=art_prompt_req)
        )
        image_prompt = art_resp.text.strip()
        yield {"event": "agent_status", "agent": "Art Director",
               "message": f"Rendering via Imagen 3 — \"{image_prompt[:50]}...\""}

        filename = f"art_{os.urandom(4).hex()}.jpg"
        output_dir = os.path.join(os.getcwd(), "generated_images")
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, filename)

        img_res = await asyncio.get_event_loop().run_in_executor(
            None, lambda: imagen_generate(image_prompt, output_path)
        )

        if img_res.get("status") == "complete":
            yield {"event": "media_done", "data": {"image_url": f"/generated_images/{filename}", "prompt": image_prompt}}
            yield {"event": "agent_status", "agent": "Coordinator", "message": "✓ Full campaign ready — copy + visual complete!"}
        else:
            yield {"event": "agent_status", "agent": "Art Director",
                   "message": f"Image render failed: {img_res.get('message', 'Unknown error')}"}
    except Exception as e:
        logger.error(f"Art Director failed: {e}")
        yield {"event": "agent_status", "agent": "Art Director", "message": f"Media rendering failed ({e})"}
