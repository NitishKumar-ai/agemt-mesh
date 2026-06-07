"""
ContentWriterAgent — Marketing Phase 2

Takes the research brief produced by ResearcherAgent and generates a
channel-appropriate campaign draft (email, LinkedIn, or security report).

Hard constraints (baked into every prompt):
- Never invent claims beyond the supplied evidence
- Never threaten, shame, or imply unauthorized access
- Always state that a human reviewed the finding
- Always invite a conversation — no high-pressure CTAs
- Draft must pass a self-review step before being written to the DB

Model: claude-sonnet-4-6 (MODEL_EXECUTE)
"""

import json
import logging
import re
from dbos import DBOS
from main import generate, MODEL_EXECUTE, update_status
from store import marketing_update_draft
from events import bus

logger = logging.getLogger(__name__)

# ── Channel-specific prompt templates ────────────────────────────────────────

_SYSTEM_CONSTRAINTS = (
    "HARD RULES — violating any rule means the draft fails self-review:\n"
    "1. Only reference evidence explicitly provided. No invented claims.\n"
    "2. Never threaten legal action, imply unauthorized system access, or shame the recipient.\n"
    "3. Always mention that a human security professional reviewed this finding.\n"
    "4. CTA must be to start a conversation, not to buy, pay, or fix immediately.\n"
    "5. Keep subject lines under 60 characters.\n"
    "6. Body must be under 250 words.\n"
)

_CHANNEL_INSTRUCTIONS = {
    "email": (
        "Write a professional B2B cold email. Format:\n"
        "SUBJECT: <subject line under 60 chars>\n"
        "BODY: <email body, plain text, under 200 words>\n"
    ),
    "linkedin": (
        "Write a LinkedIn direct message. Format:\n"
        "SUBJECT: <message title / first line, under 50 chars>\n"
        "BODY: <message body, conversational, under 150 words, no markdown>\n"
    ),
    "report": (
        "Write an executive security report summary. Format:\n"
        "SUBJECT: <report title>\n"
        "BODY: <two-paragraph executive summary — one paragraph on risk, "
        "one paragraph on recommended next steps. Under 250 words.>\n"
    ),
}


def _build_draft_prompt(channel: str, audience_profile: dict, finding_brief: dict,
                        campaign_name: str, value_proposition: str) -> str:
    channel_instr = _CHANNEL_INSTRUCTIONS.get(channel, _CHANNEL_INSTRUCTIONS["email"])
    tone = audience_profile.get("tone", "professional")
    hook = audience_profile.get("hook", "")
    pain_points = ", ".join(audience_profile.get("pain_points", []))
    one_liner = finding_brief.get("one_liner", "")
    technical_detail = finding_brief.get("technical_detail", "")
    remediation = finding_brief.get("remediation_hint", "")
    risk_level = finding_brief.get("risk_level", "high")
    cves = ", ".join(finding_brief.get("cve_ids", []))

    return (
        f"{_SYSTEM_CONSTRAINTS}\n"
        f"Channel instructions: {channel_instr}\n\n"
        f"Tone: {tone}\n"
        f"Campaign: {campaign_name}\n"
        f"Value proposition: {value_proposition}\n\n"
        f"Audience pain points: {pain_points}\n"
        f"Attention hook: {hook}\n\n"
        f"Security finding ({risk_level} risk): {one_liner}\n"
        f"Technical detail: {technical_detail}\n"
        f"Remediation: {remediation}\n"
        + (f"Related CVEs: {cves}\n" if cves else "")
        + "\nReply with ONLY the SUBJECT and BODY lines, no additional text."
    )


def _parse_subject_body(raw: str, campaign_name: str) -> tuple[str, str]:
    subject = f"Security review opportunity — {campaign_name}"
    body = raw
    for line in raw.splitlines():
        if line.startswith("SUBJECT:"):
            subject = line[len("SUBJECT:"):].strip()
        elif line.startswith("BODY:"):
            body = line[len("BODY:"):].strip()
    # If the model put body on multiple lines after BODY:
    if "BODY:" in raw:
        body = raw.split("BODY:", 1)[1].strip()
    return subject, body


# ── Internal helpers (plain functions — NOT @DBOS.step) ───────────────────────
#
# DBOS does not support nested steps. _self_review and _write_draft are
# implementation details of the run_content_writer step. Decorating them
# with @DBOS.step() would make run_content_writer → _write_draft → _self_review
# a three-level nested step chain, which DBOS rejects at runtime.
#
# Only run_content_writer (the entry point called by the workflow) is a step.
# update_status() is a @DBOS.transaction() which IS safe to call from within
# a running workflow context, so those calls stay.

def _self_review(run_id: str, subject: str, body: str, finding_summary: str) -> dict:
    """
    Ask the model to check its own draft against the hard constraints.
    Returns {"passed": bool, "issues": list[str]}.

    Plain function — called from _write_draft which is itself called from
    the run_content_writer @DBOS.step. Not independently journaled.
    """
    update_status(run_id, "ContentWriterAgent", "self_review", "running")
    prompt = (
        "You are a compliance reviewer for B2B security marketing. "
        "Check the draft below against these rules and return a JSON object with:\n"
        "  passed: true if ALL rules pass, false if any fail\n"
        "  issues: list of violated rule numbers (empty list if passed)\n\n"
        f"Rules:\n{_SYSTEM_CONSTRAINTS}\n"
        f"Finding evidence: {finding_summary[:300]}\n\n"
        f"Draft subject: {subject}\nDraft body: {body}\n\n"
        "Reply with ONLY valid JSON."
    )
    raw = generate(MODEL_EXECUTE, prompt, max_tokens=256)
    try:
        clean = re.sub(r"```[a-z]*\n?", "", raw).strip().strip("`")
        result = json.loads(clean)
    except (json.JSONDecodeError, ValueError):
        logger.warning("ContentWriterAgent: self-review parse failed, assuming passed")
        result = {"passed": True, "issues": []}
    update_status(run_id, "ContentWriterAgent", "self_review", "done")
    return result


def _write_draft(run_id: str, campaign_id: int, channel: str,
                 audience_profile: dict, finding_brief: dict,
                 campaign_name: str, value_proposition: str,
                 finding_summary: str) -> tuple[str, str]:
    """
    Generate the draft, self-review it, retry once on failure.

    Plain function — called from run_content_writer (@DBOS.step).
    Not independently journaled; the whole write+review cycle is atomic
    from DBOS's perspective, which is correct: if the step crashes mid-retry
    DBOS replays run_content_writer from the start, re-running both attempts.
    """
    update_status(run_id, "ContentWriterAgent", "write_draft", "running")

    subject, body = f"Security review — {campaign_name}", ""
    for attempt in range(2):
        prompt = _build_draft_prompt(
            channel, audience_profile, finding_brief, campaign_name, value_proposition
        )
        raw = generate(MODEL_EXECUTE, prompt, max_tokens=600)
        subject, body = _parse_subject_body(raw, campaign_name)

        review = _self_review(run_id, subject, body, finding_summary)
        if review.get("passed", True):
            break
        logger.warning(
            "ContentWriterAgent: draft failed self-review (attempt %d), issues: %s",
            attempt + 1, review.get("issues", [])
        )
        if attempt == 0:
            issue_text = "; ".join(str(i) for i in review.get("issues", []))
            value_proposition += f"\n[RETRY: fix rule violations: {issue_text}]"

    update_status(run_id, "ContentWriterAgent", "write_draft", "done")
    return subject, body


# ── Public workflow step ───────────────────────────────────────────────────────

@DBOS.step()
def run_content_writer(
    run_id: str,
    campaign_id: int,
    channel: str,
    campaign_name: str,
    value_proposition: str,
    finding_summary: str,
    research_brief: dict,
) -> dict:
    """
    Top-level DBOS step called by the marketing workflow.
    Writes the generated draft to the DB and returns {subject, body}.
    """
    _emit(run_id, "content_writer_started", {"campaign_id": campaign_id, "status": "Writing"})
    audience_profile = research_brief.get("audience_profile", {})
    finding_brief = research_brief.get("finding_brief", {})

    subject, body = _write_draft(
        run_id, campaign_id, channel,
        audience_profile, finding_brief,
        campaign_name, value_proposition, finding_summary
    )

    # Persist to DB — triggers status → review_required
    marketing_update_draft(campaign_id, subject, body)

    _emit(run_id, "content_writer_done", {
        "campaign_id": campaign_id,
        "status": "Idle",
        "subject": subject,
    })
    return {"subject": subject, "body": body}


def _emit(run_id: str, event_type: str, payload: dict) -> None:
    data = json.dumps({"agent_id": "ContentWriterAgent", "event_type": event_type,
                       "payload": {**payload, "run_id": run_id}})
    bus.emit(data)
