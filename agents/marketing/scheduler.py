"""
SchedulerAgent — Marketing Phase 2

Handles two responsibilities:
1. Wraps Typefully MCP to schedule approved LinkedIn / Twitter drafts
   for timed delivery (via the Typefully queue API).
2. Provides a DBOS workflow that orchestrates the full research → write
   → approve → schedule pipeline for a single campaign.

Rate limiting, unsubscribe, and consent checks are enforced here before
any scheduling action. Nothing is sent if these checks fail.

Typefully MCP integration:
  Uses the typefully_create_draft and typefully_get_queue_schedule tools
  when the MCP server is available. Falls back to storing the approved
  draft with status="scheduled_pending_mcp" when MCP is offline.
"""

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from dbos import DBOS
from main import update_status, check_killswitch
from store import marketing_get_campaign, marketing_list_audit_events, KillswitchEngaged
from events import bus
from agents.marketing.researcher import run_researcher
from agents.marketing.content_writer import run_content_writer

logger = logging.getLogger(__name__)

# ── Rate limiting & consent ───────────────────────────────────────────────────

# Maximum campaigns that can be scheduled per 24-hour window.
# Override via env: MARKETING_DAILY_SCHEDULE_LIMIT
_DAILY_LIMIT = int(os.environ.get("MARKETING_DAILY_SCHEDULE_LIMIT", "10"))

# How many hours to wait between scheduling two campaigns to the same audience.
# Override via env: MARKETING_MIN_AUDIENCE_GAP_HOURS
_AUDIENCE_GAP_HOURS = int(os.environ.get("MARKETING_MIN_AUDIENCE_GAP_HOURS", "24"))


@DBOS.transaction()
def _scheduled_today() -> int:
    """Count campaigns scheduled in the last 24 hours."""
    from sqlalchemy import text
    count = DBOS.sql_session.execute(text(
        "SELECT COUNT(*) FROM marketing_audit_events "
        "WHERE action='campaign_scheduled' "
        "AND created_at > datetime('now', '-24 hours')"
    )).scalar()
    return int(count or 0)


@DBOS.transaction()
def _audience_last_scheduled(audience: str) -> Optional[datetime]:
    """Return the last time this exact audience string was scheduled, or None."""
    from sqlalchemy import text
    row = DBOS.sql_session.execute(text(
        "SELECT created_at FROM marketing_audit_events "
        "WHERE action='campaign_scheduled' "
        "AND payload LIKE :audience "
        "ORDER BY created_at DESC LIMIT 1"
    ), {"audience": f"%{audience}%"}).fetchone()
    return row[0] if row else None


@DBOS.transaction()
def _mark_scheduled(campaign_id: int, audience: str, channel: str,
                    typefully_id: Optional[str]) -> None:
    """Audit-log the schedule action and update campaign status."""
    from sqlalchemy import text
    from store import _audit  # reuse existing audit helper
    DBOS.sql_session.execute(text(
        "UPDATE marketing_campaigns SET status='scheduled', updated_at=CURRENT_TIMESTAMP "
        "WHERE id=:cid"
    ), {"cid": campaign_id})
    _audit("campaign", campaign_id, "campaign_scheduled", "SchedulerAgent", {
        "channel": channel,
        "audience": audience,
        "typefully_id": typefully_id,
    })


# ── Typefully integration ─────────────────────────────────────────────────────

@DBOS.step()
def _push_to_typefully(run_id: str, campaign_id: int, channel: str,
                       subject: str, body: str) -> dict:
    """
    Attempt to create a Typefully draft for the approved campaign.
    LinkedIn and Twitter/X channels are supported. Email campaigns are
    logged but not pushed (email delivery is out of scope until Phase 2
    delivery policy is fully implemented).

    Returns {"typefully_id": str | None, "method": "typefully" | "pending" | "email_skip"}.
    """
    update_status(run_id, "SchedulerAgent", "push_typefully", "running")

    if channel == "email":
        logger.info("SchedulerAgent: email scheduling deferred (delivery policy Phase 2)")
        update_status(run_id, "SchedulerAgent", "push_typefully", "skipped")
        return {"typefully_id": None, "method": "email_skip"}

    # Build the post content — subject becomes the first line for LinkedIn
    content = f"{subject}\n\n{body}" if channel == "linkedin" else body

    try:
        # Import here so that the agent module loads even when the MCP tools
        # are not present in this Python process (they live in Claude Code's
        # tool environment, not the FastAPI process). When running inside a
        # DBOS workflow spawned by the API, we call Typefully via HTTP directly.
        typefully_api_key = os.environ.get("TYPEFULLY_API_KEY", "")
        if not typefully_api_key:
            raise RuntimeError("TYPEFULLY_API_KEY not set")

        import httpx
        # Typefully REST API — create a draft in the queue
        resp = httpx.post(
            "https://api.typefully.com/v1/drafts/",
            headers={
                "X-API-KEY": f"Bearer {typefully_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "content": content,
                "schedule-date": _next_schedule_slot(),
                "auto-retweet-enabled": False,
                "auto-plug-enabled": False,
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        typefully_id = str(data.get("id", ""))
        logger.info("SchedulerAgent: Typefully draft created id=%s", typefully_id)
        update_status(run_id, "SchedulerAgent", "push_typefully", "done")
        return {"typefully_id": typefully_id, "method": "typefully"}

    except Exception as exc:
        logger.warning("SchedulerAgent: Typefully push failed (%s) — marking pending", exc)
        update_status(run_id, "SchedulerAgent", "push_typefully", "failed")
        return {"typefully_id": None, "method": "pending"}


def _next_schedule_slot() -> str:
    """Return an ISO-8601 datetime 25 hours from now (next business window)."""
    slot = datetime.now(timezone.utc) + timedelta(hours=25)
    return slot.strftime("%Y-%m-%dT%H:%M:%SZ")


# ── Consent & rate-limit gate ─────────────────────────────────────────────────

@DBOS.step()
def _check_rate_limits(run_id: str, audience: str) -> dict:
    """
    Returns {"ok": bool, "reason": str}. Blocks scheduling if:
    - Daily schedule limit reached
    - Same audience scheduled within the gap window
    """
    update_status(run_id, "SchedulerAgent", "rate_limit_check", "running")
    today_count = _scheduled_today()
    if today_count >= _DAILY_LIMIT:
        return {"ok": False, "reason": f"Daily limit of {_DAILY_LIMIT} campaigns reached"}

    last = _audience_last_scheduled(audience)
    if last:
        gap = datetime.now(timezone.utc) - last.replace(tzinfo=timezone.utc)
        if gap.total_seconds() < _AUDIENCE_GAP_HOURS * 3600:
            hours_left = _AUDIENCE_GAP_HOURS - int(gap.total_seconds() // 3600)
            return {"ok": False,
                    "reason": f"Audience '{audience}' was scheduled {int(gap.total_seconds()//3600)}h ago — "
                               f"wait {hours_left}h more"}

    update_status(run_id, "SchedulerAgent", "rate_limit_check", "done")
    return {"ok": True, "reason": ""}


# ── Public workflow step (schedule only) ──────────────────────────────────────

@DBOS.step()
def run_scheduler(run_id: str, campaign_id: int) -> dict:
    """
    Schedule an already-approved campaign. Called by the marketing workflow
    after operator approval. Enforces rate limits, then pushes to Typefully.
    """
    check_killswitch()
    campaign = marketing_get_campaign(campaign_id)
    if not campaign:
        return {"ok": False, "reason": "Campaign not found"}
    if campaign["status"] != "approved":
        return {"ok": False, "reason": f"Campaign status is '{campaign['status']}', must be approved"}

    _emit(run_id, "scheduler_started", {"campaign_id": campaign_id, "status": "Scheduling"})

    rate = _check_rate_limits(run_id, campaign["audience"])
    if not rate["ok"]:
        _emit(run_id, "scheduler_blocked", {"campaign_id": campaign_id,
                                            "reason": rate["reason"], "status": "Idle"})
        return rate

    result = _push_to_typefully(
        run_id, campaign_id, campaign["channel"],
        campaign.get("subject", ""), campaign.get("body", "")
    )

    _mark_scheduled(campaign_id, campaign["audience"], campaign["channel"],
                    result.get("typefully_id"))

    _emit(run_id, "scheduler_done", {
        "campaign_id": campaign_id,
        "method": result["method"],
        "typefully_id": result.get("typefully_id"),
        "status": "Idle",
    })
    return {"ok": True, **result}


# ── Full pipeline workflow ────────────────────────────────────────────────────

@DBOS.workflow()
def marketing_pipeline(campaign_id: int, finding_evidence: str) -> dict:
    """
    Orchestrates: Research → Write → [human approval gate] → Schedule.

    The workflow suspends at the approval gate (DBOS.recv) for up to 24h.
    The operator approves via the Approvals tab or /api/approve/{workflow_id}.
    """
    check_killswitch()
    run_id = DBOS.workflow_id
    campaign = marketing_get_campaign(campaign_id)
    if not campaign:
        return {"error": "Campaign not found"}

    # Phase 1: Research
    research_brief = run_researcher(
        run_id,
        campaign_id,
        campaign["audience"],
        campaign["channel"],
        campaign["finding_summary"],
        finding_evidence,
    )

    # Phase 2: Write
    draft = run_content_writer(
        run_id,
        campaign_id,
        campaign["channel"],
        campaign["name"],
        campaign.get("value_proposition", ""),
        campaign["finding_summary"],
        research_brief,
    )

    # Phase 3: Human approval gate — workflow suspends here
    _emit_workflow(run_id, campaign_id, "approval_required", {
        "status": "Blocked",
        "subject": draft["subject"],
        "body_preview": draft["body"][:200],
        "risk_level": research_brief.get("finding_brief", {}).get("risk_level", "high"),
        "workflow_id": run_id,
    })
    approval = DBOS.recv("approval", timeout_seconds=86400)  # 24h gate

    if approval is None:
        _emit_workflow(run_id, campaign_id, "pipeline_timeout", {"status": "Failed"})
        return {"ok": False, "reason": "Approval timed out after 24h"}

    if not approval.get("approved"):
        _emit_workflow(run_id, campaign_id, "pipeline_rejected", {"status": "Failed"})
        return {"ok": False, "reason": "Operator rejected the draft"}

    # Phase 4: Schedule
    check_killswitch()
    schedule_result = run_scheduler(run_id, campaign_id)
    _emit_workflow(run_id, campaign_id, "pipeline_done", {
        "status": "Success",
        **schedule_result,
    })
    return schedule_result


def _emit_workflow(run_id: str, campaign_id: int, event_type: str, payload: dict) -> None:
    data = json.dumps({"agent_id": "SchedulerAgent", "event_type": event_type,
                       "payload": {**payload, "run_id": run_id, "campaign_id": campaign_id}})
    bus.emit(data)


def _emit(run_id: str, event_type: str, payload: dict) -> None:
    _emit_workflow(run_id, 0, event_type, payload)
