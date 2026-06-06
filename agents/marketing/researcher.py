"""
ResearcherAgent — Marketing Phase 2

Given a verified security finding and target audience, this agent:
1. Researches the audience segment (industry, typical stack, pain points)
2. Pulls related CVEs / NIST NVD context for the finding
3. Returns a structured research brief that ContentWriterAgent uses to
   generate high-quality, evidence-backed campaign copy.

Model: claude-sonnet-4-6 (MODEL_EXECUTE) — nuanced reasoning needed.
"""

import json
import logging
import os
import re
from dbos import DBOS
from main import generate, MODEL_EXECUTE, update_status
from events import bus

logger = logging.getLogger(__name__)


# ── CVE / NVD helpers ────────────────────────────────────────────────────────

def _extract_cve_ids(text: str) -> list[str]:
    """Pull CVE-YYYY-NNNNN identifiers from any text block."""
    return list(set(re.findall(r"CVE-\d{4}-\d{4,7}", text, re.IGNORECASE)))


def _fetch_nvd_summary(cve_id: str) -> dict:
    """
    Fetch NIST NVD summary for a CVE via the public REST API (no key required
    for low-volume calls). Returns a dict with keys: id, description, cvss_score,
    cvss_vector, published. Falls back to an empty dict on any error.
    """
    try:
        import httpx
        url = f"https://services.nvd.nist.gov/rest/json/cves/2.0?cveId={cve_id}"
        resp = httpx.get(url, timeout=8)
        if resp.status_code != 200:
            return {}
        data = resp.json()
        vulns = data.get("vulnerabilities", [])
        if not vulns:
            return {}
        cve = vulns[0]["cve"]
        desc = next(
            (d["value"] for d in cve.get("descriptions", []) if d["language"] == "en"),
            ""
        )
        metrics = cve.get("metrics", {})
        cvss_score = None
        cvss_vector = None
        for key in ("cvssMetricV31", "cvssMetricV30", "cvssMetricV2"):
            if key in metrics and metrics[key]:
                m = metrics[key][0].get("cvssData", {})
                cvss_score = m.get("baseScore")
                cvss_vector = m.get("vectorString")
                break
        return {
            "id": cve_id,
            "description": desc,
            "cvss_score": cvss_score,
            "cvss_vector": cvss_vector,
            "published": cve.get("published", ""),
        }
    except Exception as exc:
        logger.warning("NVD fetch failed for %s: %s", cve_id, exc)
        return {}


# ── DBOS steps ────────────────────────────────────────────────────────────────

@DBOS.step()
def _research_audience(run_id: str, audience: str, channel: str) -> dict:
    """Use the LLM to profile the target audience for the campaign channel."""
    update_status(run_id, "ResearcherAgent", "research_audience", "running")
    prompt = (
        "You are a B2B market researcher. Given the target audience and channel below, "
        "produce a concise JSON object with these keys:\n"
        "  industry: the most likely industry vertical (string)\n"
        "  stack_keywords: top 3-5 technology keywords this audience cares about (list of strings)\n"
        "  pain_points: top 3 security pain points this audience faces (list of strings)\n"
        "  tone: recommended writing tone for this channel (string, e.g. 'formal', 'friendly', 'technical')\n"
        "  hook: one-sentence attention hook that resonates with this audience (string)\n\n"
        f"Audience: {audience}\nChannel: {channel}\n\n"
        "Reply with ONLY valid JSON, no markdown fences."
    )
    raw = generate(MODEL_EXECUTE, prompt, max_tokens=512)
    try:
        # Strip any markdown fences the model may add despite instructions
        clean = re.sub(r"```[a-z]*\n?", "", raw).strip().strip("`")
        profile = json.loads(clean)
    except (json.JSONDecodeError, ValueError):
        logger.warning("ResearcherAgent: audience profile parse failed, using defaults")
        profile = {
            "industry": "technology",
            "stack_keywords": [],
            "pain_points": ["security vulnerabilities", "compliance risk", "data exposure"],
            "tone": "professional",
            "hook": f"We found a security pattern relevant to {audience}.",
        }
    update_status(run_id, "ResearcherAgent", "research_audience", "done")
    return profile


@DBOS.step()
def _research_finding(run_id: str, finding_summary: str, evidence: str) -> dict:
    """
    Extract CVE IDs from the finding, fetch NVD context, and ask the LLM
    to produce a risk brief suitable for use in campaign copy.
    """
    update_status(run_id, "ResearcherAgent", "research_finding", "running")
    cve_ids = _extract_cve_ids(f"{finding_summary} {evidence}")
    nvd_entries = [_fetch_nvd_summary(cid) for cid in cve_ids[:3]]  # cap at 3 CVEs
    nvd_entries = [e for e in nvd_entries if e]  # drop empty

    nvd_context = ""
    if nvd_entries:
        lines = []
        for e in nvd_entries:
            score = f"CVSS {e['cvss_score']}" if e["cvss_score"] else "score unavailable"
            lines.append(f"- {e['id']} ({score}): {e['description'][:200]}")
        nvd_context = "\nNVD context:\n" + "\n".join(lines)

    prompt = (
        "You are a security analyst writing for a B2B marketing brief. "
        "Produce a JSON object with these keys:\n"
        "  risk_level: one of critical/high/medium/low (string)\n"
        "  one_liner: one sentence describing the risk for a non-technical exec (string)\n"
        "  technical_detail: two sentences of technical depth for an engineering audience (string)\n"
        "  remediation_hint: one sentence on how this class of issue is typically fixed (string)\n"
        "  cve_ids: list of CVE IDs mentioned (list of strings, empty if none)\n\n"
        f"Finding: {finding_summary}\nEvidence excerpt: {evidence[:500]}"
        f"{nvd_context}\n\n"
        "Reply with ONLY valid JSON, no markdown fences."
    )
    raw = generate(MODEL_EXECUTE, prompt, max_tokens=512)
    try:
        clean = re.sub(r"```[a-z]*\n?", "", raw).strip().strip("`")
        brief = json.loads(clean)
    except (json.JSONDecodeError, ValueError):
        logger.warning("ResearcherAgent: finding brief parse failed, using defaults")
        brief = {
            "risk_level": "high",
            "one_liner": finding_summary[:200],
            "technical_detail": evidence[:200],
            "remediation_hint": "Apply vendor patches and review access controls.",
            "cve_ids": cve_ids,
        }

    # Attach validated NVD data for downstream CVSS calibration
    brief["nvd_entries"] = nvd_entries
    update_status(run_id, "ResearcherAgent", "research_finding", "done")
    return brief


# ── Public workflow step ───────────────────────────────────────────────────────

@DBOS.step()
def run_researcher(
    run_id: str,
    campaign_id: int,
    audience: str,
    channel: str,
    finding_summary: str,
    evidence: str,
) -> dict:
    """
    Top-level DBOS step called by the marketing workflow.
    Returns a research_brief dict consumed by ContentWriterAgent.
    """
    _emit(run_id, "researcher_started", {"campaign_id": campaign_id, "status": "Researching"})
    audience_profile = _research_audience(run_id, audience, channel)
    finding_brief = _research_finding(run_id, finding_summary, evidence)
    brief = {
        "campaign_id": campaign_id,
        "audience_profile": audience_profile,
        "finding_brief": finding_brief,
    }
    _emit(run_id, "researcher_done", {"campaign_id": campaign_id, "status": "Idle",
                                      "risk_level": finding_brief.get("risk_level")})
    return brief


def _emit(run_id: str, event_type: str, payload: dict) -> None:
    data = json.dumps({"agent_id": "ResearcherAgent", "event_type": event_type,
                       "payload": {**payload, "run_id": run_id}})
    bus.emit(data)
