"""
Campaign Pipeline — Autonomous Commit-to-Campaign Orchestrator
==============================================================
Stitches a *verified* security finding into a live multi-platform social campaign:

    finding -> researcher -> social_studio marketing_team DAG (drafts + Imagen art)
            -> compliance gate (responsible-disclosure constraints)
            -> human approval (one click) -> publish (all connected accounts) -> audit

DBOS-durable: a crash resumes from the last completed step. The killswitch is
checked at the start of every step AND again on resume after the approval gate
(killswitch wins over replay).

`finding_id` is carried end-to-end so every published post traces structurally
back to its source finding — the provenance differentiator.

Demo-safety: drafts are persisted and the approval gate runs even in dry-run;
only the real OAuth publish is skipped unless go_live=True. The fallback for a
failed/blocked publish is an honest "queued — retrying" status, never a fake post.
"""

import asyncio
import json
import logging

from dbos import DBOS

from events import bus

logger = logging.getLogger(__name__)

AGENT = "CampaignOrchestrator"


# ── Event emission (unified War Room bus vocabulary) ──────────────────────────

def _emit(run_id: str, campaign_id: int, finding_id: int, event_type: str,
          payload: dict | None = None, agent_id: str = AGENT) -> None:
    """Emit one campaign event on the shared bus, always carrying the run/campaign/finding ids."""
    body = {"run_id": run_id, "campaign_id": campaign_id, "finding_id": finding_id}
    if payload:
        body.update(payload)
    bus.emit(json.dumps({"agent_id": agent_id, "event_type": event_type, "payload": body}))


def _emit_approval(run_id: str, campaign_id: int, finding_id: int,
                   drafts: list, held_count: int) -> None:
    """
    Dual-write the approval gate: a DB agent_events row (so the Approvals tab can
    act on it) AND a bus event (so the War Room shows the inline gate). Mirrors
    harness._harness_request_approval — the canonical clickable-approval pattern.
    """
    from main import publish_event
    preview = [
        {"platform": d.get("platform"),
         "content": (d.get("content", "") or "")[:200],
         "held": d.get("compliance") == "held"}
        for d in drafts
    ]
    event = {
        "agent_id": AGENT,
        "event_type": "approval_required",
        "payload": {
            "run_id": run_id, "campaign_id": campaign_id, "finding_id": finding_id,
            "workflow_id": run_id, "status": "Blocked",
            "drafts_preview": preview, "held_count": held_count,
            "publishable_count": len(drafts) - held_count,
            "risk_level": "high",
        },
    }
    publish_event("default", event)        # -> agent_events row the Approvals tab reads
    bus.emit(json.dumps(event))            # -> War Room SSE


# ── Steps ─────────────────────────────────────────────────────────────────────

@DBOS.step()
def run_marketing_dag(run_id: str, campaign_id: int, finding_id: int,
                      topic: str, tone: str, brand_voice: str,
                      platforms: list, generate_image: bool = True) -> dict:
    """
    Drive the async ``run_marketing_team`` generator from a synchronous DBOS step,
    emitting each yielded event to the bus as it arrives.

    NON-DETERMINISTIC ON REPLAY: a crash mid-generation re-runs this WHOLE step on
    recovery, producing a fresh draft set and re-emitting SSE. This is safe because
    nothing is persisted (persist_drafts) or published (publish_fanout) until later
    steps, and approval happens after persistence — so the operator always approves
    the persisted set, never a transient pre-crash draft.

    The async-in-sync idiom mirrors main.step_social_studio_autopost (asyncio.run of
    an async coroutine that emits to the bus). bus.emit marshals worker-thread ->
    uvicorn-loop via call_soon_threadsafe, so emitting from this private loop is safe.
    """
    from main import check_killswitch
    check_killswitch()
    from agents.social_studio.marketing_team import run_marketing_team

    async def _drive():
        drafts: list = []
        image_url = None
        image_prompt = None
        async for ev in run_marketing_team(topic, tone, brand_voice, platforms,
                                           generate_image=generate_image):
            etype = ev.get("event")
            if etype == "agent_status":
                _emit(run_id, campaign_id, finding_id, "dag_agent_status",
                      {"agent": ev.get("agent"), "message": ev.get("message"),
                       "status": "Generating"}, agent_id="SocialStudioTeam")
            elif etype == "platform_done":
                d = ev.get("data", {})
                drafts.append(d)
                _emit(run_id, campaign_id, finding_id, "draft_ready",
                      {"platform": d.get("platform"), "label": d.get("label"),
                       "content": d.get("content", ""), "hashtags": d.get("hashtags", ""),
                       "char_count": d.get("char_count"), "char_limit": d.get("char_limit"),
                       "draft_status": d.get("status"), "status": "Generating"},
                      agent_id="SocialStudioTeam")
            elif etype == "media_done":
                d = ev.get("data", {})
                image_url = d.get("image_url")
                image_prompt = d.get("prompt")
                _emit(run_id, campaign_id, finding_id, "art_ready",
                      {"image_url": image_url, "prompt": image_prompt, "status": "Generating"},
                      agent_id="SocialStudioTeam")
        return drafts, image_url, image_prompt

    drafts, image_url, image_prompt = asyncio.run(_drive())
    return {"drafts": drafts, "image_url": image_url, "image_prompt": image_prompt}


@DBOS.step()
def compliance_gate(run_id: str, campaign_id: int, finding_id: int, drafts: list,
                    finding_summary: str, topic: str, tone: str, brand_voice: str) -> dict:
    """
    Route every social draft through the responsible-disclosure constraints
    (content_writer._self_review). regenerate-once-then-hold: a failing draft is
    re-drafted once feeding the violated rule numbers back; if it still fails, the
    ORIGINAL is kept marked compliance="held" and is never published.
    """
    from main import check_killswitch
    check_killswitch()
    from agents.marketing.content_writer import _self_review
    from agents.social_studio.marketing_team import _draft_platform

    _emit(run_id, campaign_id, finding_id, "compliance_started",
          {"count": len(drafts), "status": "Reviewing"}, agent_id="ComplianceGate")

    def _body(d: dict) -> str:
        content = d.get("content", "") or ""
        tags = d.get("hashtags", "") or ""
        return (content + ("\n" + tags if tags else "")).strip()

    reviewed: list = []
    passed_count = 0
    held_count = 0

    for d in drafts:
        platform = d.get("platform")

        # Drafts that already failed generation are held outright.
        if d.get("status") == "failed":
            held_count += 1
            reviewed.append({**d, "compliance": "held"})
            _emit(run_id, campaign_id, finding_id, "compliance_draft_result",
                  {"platform": platform, "passed": False, "issues": [], "attempt": 1,
                   "action": "held", "status": "Reviewing"}, agent_id="ComplianceGate")
            continue

        review = _self_review(run_id, "", _body(d), finding_summary)
        if review.get("passed"):
            passed_count += 1
            reviewed.append({**d, "compliance": "passed"})
            _emit(run_id, campaign_id, finding_id, "compliance_draft_result",
                  {"platform": platform, "passed": True, "issues": [], "attempt": 1,
                   "action": "pass", "status": "Reviewing"}, agent_id="ComplianceGate")
            continue

        # Regenerate once, feeding the violated rule numbers back as a fix brief.
        issues = review.get("issues", [])
        fix_brief = (
            f"Topic: {topic}\nTone: {tone}\nBrand Voice: {brand_voice}\n"
            f"COMPLIANCE FIX REQUIRED — the previous draft violated these rules: {issues}. "
            "Rewrite so it: only references the provided evidence (no invented claims); never "
            "shames the recipient or threatens legal action; explicitly mentions that a human "
            "security professional reviewed this finding; and uses a CTA that invites a "
            "conversation (not buy/pay/fix immediately)."
        )
        regen = None
        try:
            regen = asyncio.run(_draft_platform(platform, topic, fix_brief, finding_summary))
        except Exception as e:  # noqa: BLE001 — regeneration is best-effort; fall through to hold
            logger.warning("compliance regenerate failed for %s: %s", platform, e)

        if regen and regen.get("status") != "failed":
            review2 = _self_review(run_id, "", _body(regen), finding_summary)
            if review2.get("passed"):
                passed_count += 1
                reviewed.append({**regen, "compliance": "passed"})
                _emit(run_id, campaign_id, finding_id, "compliance_draft_result",
                      {"platform": platform, "passed": True, "issues": issues, "attempt": 2,
                       "action": "regenerated", "status": "Reviewing"}, agent_id="ComplianceGate")
                continue

        # Still failing -> hold the original, never publish it.
        held_count += 1
        reviewed.append({**d, "compliance": "held"})
        _emit(run_id, campaign_id, finding_id, "compliance_draft_result",
              {"platform": platform, "passed": False, "issues": issues, "attempt": 2,
               "action": "held", "status": "Reviewing"}, agent_id="ComplianceGate")

    _emit(run_id, campaign_id, finding_id, "compliance_done",
          {"passed_count": passed_count, "held_count": held_count, "status": "Reviewing"},
          agent_id="ComplianceGate")
    return {"drafts": reviewed, "passed_count": passed_count, "held_count": held_count}


@DBOS.step()
def persist_drafts(run_id: str, campaign_id: int, topic: str, tone: str,
                   drafts: list, image_url: str | None, account_map: dict) -> list:
    """Persist all drafts (held included, so they're visible) as ss_platform_posts."""
    from main import check_killswitch
    check_killswitch()
    from store import ss_create_posts

    posts = [{
        "platform": d.get("platform"),
        "account_id": account_map.get(d.get("platform")),
        "content": d.get("content", ""),
        "hashtags": d.get("hashtags", ""),
        "char_count": d.get("char_count", 0),
        "image_url": image_url,
    } for d in drafts]
    return ss_create_posts(run_id, topic, tone, posts) if posts else []


@DBOS.step()
def publish_fanout(run_id: str, campaign_id: int, finding_id: int,
                   post_specs: list, go_live: bool) -> dict:
    """
    Fan out to every connected account. Replay-safe (never double-posts). A held
    draft is skipped; a dry-run or token-less post is surfaced as an honest
    "queued — retrying" (never a fake post). Real retryable failures already have
    next_retry_at set by publish_platform_post; the per-minute publisher daemon
    resolves them.
    """
    from main import check_killswitch
    check_killswitch()
    import os
    from store import ss_get_account_token, ss_get_platform_post
    from agents.social_studio.publisher import publish_platform_post

    publishable = [s for s in post_specs if not s["held"]]
    _emit(run_id, campaign_id, finding_id, "publish_started",
          {"count": len(publishable), "go_live": go_live, "status": "Publishing"},
          agent_id="PublisherAgent")

    published = queued = held = 0
    backend_url = os.environ.get("BACKEND_URL", "http://127.0.0.1:8000")

    for s in post_specs:
        platform = s["platform"]
        post_id = s["post_id"]

        if s["held"]:
            held += 1
            _emit(run_id, campaign_id, finding_id, "publish_platform_result",
                  {"platform": platform, "post_id": post_id, "success": False,
                   "action": "held", "status": "Publishing"}, agent_id="PublisherAgent")
            continue

        # Replay-safe: never double-post to a real account on workflow recovery.
        existing = ss_get_platform_post(post_id)
        if existing and existing.get("status") == "published":
            published += 1
            _emit(run_id, campaign_id, finding_id, "publish_platform_result",
                  {"platform": platform, "post_id": post_id, "success": True,
                   "url": existing.get("platform_post_url"), "reason": "already_published",
                   "status": "Publishing"}, agent_id="PublisherAgent")
            continue

        token = ss_get_account_token(s["account_id"]) if s.get("account_id") else None
        if not go_live or not token:
            queued += 1
            reason = "dry_run" if not go_live else "no_connected_account"
            _emit(run_id, campaign_id, finding_id, "publish_platform_result",
                  {"platform": platform, "post_id": post_id, "success": False,
                   "queued_retry": True, "reason": reason, "status": "Publishing"},
                  agent_id="PublisherAgent")
            continue

        media_urls = None
        if s.get("image_url"):
            img = s["image_url"]
            if img.startswith("/"):
                img = backend_url.rstrip("/") + img
            media_urls = [img]

        pub = publish_platform_post(
            platform_post_id=post_id, platform=platform,
            content=s["content"], hashtags=s["hashtags"],
            access_token=token, account_id=s["account_id"], media_urls=media_urls,
        )
        if pub.get("success"):
            published += 1
            _emit(run_id, campaign_id, finding_id, "publish_platform_result",
                  {"platform": platform, "post_id": post_id, "success": True,
                   "url": pub.get("url"), "status": "Publishing"}, agent_id="PublisherAgent")
        else:
            # publish_platform_post already recorded next_retry_at; the cron retries.
            queued += 1
            _emit(run_id, campaign_id, finding_id, "publish_platform_result",
                  {"platform": platform, "post_id": post_id, "success": False,
                   "queued_retry": True, "error": pub.get("error"), "status": "Publishing"},
                  agent_id="PublisherAgent")

    _emit(run_id, campaign_id, finding_id, "publish_done",
          {"published": published, "queued": queued, "held": held, "status": "Publishing"},
          agent_id="PublisherAgent")
    return {"published": published, "queued": queued, "held": held}


@DBOS.transaction()
def _record_commit_audit(campaign_id: int, finding_id: int, action: str, payload: dict) -> None:
    from store import _audit
    _audit("campaign", campaign_id, action, AGENT, {**payload, "finding_id": finding_id})


# ── Workflow ────────────────────────────────────────────────────────────────────

@DBOS.workflow()
def commit_to_campaign(finding_id: int, go_live: bool = False) -> dict:
    """
    Autonomous commit-to-campaign: a verified finding becomes a live multi-platform
    campaign, gated by exactly one human approval click. Durable end-to-end.
    """
    from main import check_killswitch
    from store import (KillswitchEngaged, security_get_finding,
                       marketing_create_campaign, ss_get_connected_accounts)
    from agents.marketing.researcher import run_researcher

    run_id = DBOS.workflow_id

    try:
        check_killswitch()

        finding = security_get_finding(finding_id)
        if not finding:
            return {"ok": False, "reason": "finding_not_found"}
        if finding.get("status") != "verified":
            return {"ok": False, "reason": "finding_not_verified"}

        name = f"Campaign: {(finding.get('title') or 'Security finding')[:60]}"
        _emit(run_id, 0, finding_id, "commit_started",
              {"finding_title": finding.get("title"), "severity": finding.get("severity"),
               "go_live": go_live, "status": "Researching"})

        try:
            campaign_id, finding_summary = marketing_create_campaign(
                source_finding_id=finding_id,
                name=name,
                audience="security-conscious engineering leaders",
                finding_summary=finding.get("summary", ""),
                value_proposition="We found and verified this issue — let's start a conversation.",
                channel="social",
            )
        except ValueError as e:
            _emit(run_id, 0, finding_id, "campaign_rejected",
                  {"reason": str(e), "status": "Failed"})
            return {"ok": False, "reason": str(e)}

        _emit(run_id, campaign_id, finding_id, "campaign_created",
              {"name": name, "channel": "social", "status": "Researching"})

        # Phase 1: Research (reuses the existing finding-aware researcher).
        check_killswitch()
        brief = run_researcher(run_id, campaign_id, "security-conscious engineering leaders",
                               "social", finding_summary, finding.get("evidence", ""))
        ap = brief.get("audience_profile", {})
        fb = brief.get("finding_brief", {})
        tone = ap.get("tone", "professional")
        brand_voice = ap.get("hook", "responsible, factual, conversational")
        topic = fb.get("one_liner") or finding_summary or finding.get("title", "")
        _emit(run_id, campaign_id, finding_id, "research_done",
              {"risk_level": fb.get("risk_level"), "tone": tone,
               "industry": ap.get("industry"), "status": "Generating"})

        # Phase 2: Social DAG — fan out to ALL connected platforms (drafts + art).
        accounts = ss_get_connected_accounts()
        account_map = {a["platform"]: a["id"] for a in accounts}
        platforms = list(account_map.keys()) or ["linkedin", "twitter"]
        check_killswitch()
        dag = run_marketing_dag(run_id, campaign_id, finding_id, topic, tone,
                                brand_voice, platforms)
        drafts = dag.get("drafts", [])
        image_url = dag.get("image_url")

        # Phase 3: Compliance gate (responsible-disclosure constraints).
        check_killswitch()
        gate = compliance_gate(run_id, campaign_id, finding_id, drafts, finding_summary,
                               topic, tone, brand_voice)
        drafts = gate.get("drafts", [])
        held_count = gate.get("held_count", 0)

        # Phase 4: Persist drafts and build publish specs.
        post_ids = persist_drafts(run_id, campaign_id, topic, tone, drafts, image_url, account_map)
        post_specs = [{
            "post_id": pid, "platform": d.get("platform"),
            "content": d.get("content", ""), "hashtags": d.get("hashtags", ""),
            "account_id": account_map.get(d.get("platform")), "image_url": image_url,
            "held": d.get("compliance") == "held",
        } for d, pid in zip(drafts, post_ids)]
        _emit(run_id, campaign_id, finding_id, "drafts_persisted",
              {"post_ids": post_ids, "platforms": [s["platform"] for s in post_specs],
               "status": "Blocked"})

        # Phase 5: Human approval gate — the single, deliberate human beat.
        _emit_approval(run_id, campaign_id, finding_id, drafts, held_count)
        approval = DBOS.recv("approval", timeout_seconds=86400)
        if approval is None:
            _emit(run_id, campaign_id, finding_id, "campaign_timeout",
                  {"reason": "approval_timeout", "status": "Failed"})
            return {"ok": False, "campaign_id": campaign_id, "reason": "approval_timeout"}
        if not approval.get("approved"):
            _emit(run_id, campaign_id, finding_id, "campaign_rejected",
                  {"reason": "rejected_by_operator", "status": "Failed"})
            _record_commit_audit(campaign_id, finding_id, "campaign_rejected",
                                 {"note": approval.get("note", "")})
            return {"ok": False, "campaign_id": campaign_id, "reason": "rejected"}

        # Phase 6: Publish — killswitch RE-CHECKED on resume (killswitch wins over replay).
        check_killswitch()
        result = publish_fanout(run_id, campaign_id, finding_id, post_specs, go_live)

        # Phase 7: Audit.
        _record_commit_audit(campaign_id, finding_id, "campaign_committed",
                             {**result, "go_live": go_live, "note": approval.get("note", "")})
        status = "Success" if result.get("queued", 0) == 0 and result.get("held", 0) == 0 else "Partial"
        _emit(run_id, campaign_id, finding_id, "campaign_done", {**result, "status": status})
        return {"ok": True, "campaign_id": campaign_id, **result}

    except KillswitchEngaged as e:
        _emit(run_id, 0, finding_id, "killswitch_halt", {"reason": str(e), "status": "Failed"})
        return {"ok": False, "reason": "killswitch_engaged"}
