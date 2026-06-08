"""
CommitGuard verifier: E2B sandbox PoC execution → CONFIRMED/UNVERIFIABLE/FALSE_POSITIVE.

Per-category CONFIRMED definition (exit 0 + EXPLOIT_MARKER in stdout):
  sql_injection        — PoC asserts injection string contains quote / OR 1=1
  hardcoded_secret     — PoC extracts secret value matching known pattern
  path_traversal       — PoC verifies resolved path escapes intended root
  insecure_deserial.   — PoC demonstrates code execution via crafted payload
  (all others)         — returns UNVERIFIABLE without attempting E2B

All PoC scripts are self-contained (no repo imports). E2B receives only the script.
Webhook fires immediately on CONFIRMED, before step returns.
"""

import json
import logging
import os
from typing import Optional, Tuple

import httpx
try:
    from langfuse import observe
except Exception:
    # Langfuse not configured or not installed — use a no-op decorator
    def observe(name=None, **_kw):  # type: ignore[misc]
        def decorator(fn):
            return fn
        return decorator
from pydantic import BaseModel

from main import generate, MODEL_EXECUTE

logger = logging.getLogger(__name__)

EXPLOIT_MARKER = "EXPLOIT_CONFIRMED"

POC_PROMPTS = {
    "sql_injection": (
        "Write a self-contained Python script (no imports from the target repo) that:\n"
        "1. Constructs the SQL injection string described in this finding.\n"
        "2. Asserts the string contains a single quote or OR 1=1 pattern.\n"
        "3. Prints 'EXPLOIT_CONFIRMED' if the assertion passes.\n"
        "Reply with ONLY the Python script, no explanation."
    ),
    "hardcoded_secret": (
        "Write a self-contained Python script (no imports from the target repo) that:\n"
        "1. Hard-codes the secret value from this finding as a string literal.\n"
        "2. Verifies it matches a known pattern (e.g. API key prefix, token format).\n"
        "3. Prints 'EXPLOIT_CONFIRMED' if the pattern matches.\n"
        "Reply with ONLY the Python script, no explanation."
    ),
    "path_traversal": (
        "Write a self-contained Python script (no imports from the target repo) that:\n"
        "1. Constructs the path traversal input described in this finding.\n"
        "2. Uses os.path.normpath to resolve it and verifies it escapes the intended root.\n"
        "3. Prints 'EXPLOIT_CONFIRMED' if the escape is confirmed.\n"
        "Reply with ONLY the Python script, no explanation."
    ),
    "insecure_deserialization": (
        "Write a self-contained Python script (no imports from the target repo) that:\n"
        "1. Crafts the malicious payload described in this finding.\n"
        "2. Calls pickle.loads or the relevant deserializer with the payload.\n"
        "3. Prints 'EXPLOIT_CONFIRMED' if execution reaches the crafted code path.\n"
        "Reply with ONLY the Python script, no explanation."
    ),
}

CVSS_PROMPT = (
    "You are a security analyst. Given this vulnerability finding, provide:\n"
    "1. A CVSS 3.1 base score and severity (e.g. '8.1 HIGH').\n"
    "2. The CWE identifier (e.g. 'CWE-89').\n"
    "Reply with exactly two lines:\n"
    "CVSS: <score severity>\n"
    "CWE: <CWE-NNN>\n"
    "Note: this is an AI estimate, not a validated assessment.\n"
)


class VerifiedFinding(BaseModel):
    finding_id: str
    file: str
    line: int
    severity: str
    vuln_type: str
    category: str
    description: str
    verdict: str            # CONFIRMED / UNVERIFIABLE / FALSE_POSITIVE
    poc_summary: str
    cvss: Optional[str]     # AI-estimated, not validated
    cwe: Optional[str]
    webhook_fired: bool


@observe(name="commitguard_generate_poc")
def _generate_poc(finding: dict) -> str:
    prompt_template = POC_PROMPTS.get(finding["category"])
    if not prompt_template:
        return ""
    prompt = (
        f"Finding:\n"
        f"File: {finding['file']}:{finding['line']}\n"
        f"Type: {finding['vuln_type']}\n"
        f"Description: {finding['description']}\n\n"
        + prompt_template
    )
    try:
        return generate(MODEL_EXECUTE, prompt).strip()
    except Exception as e:
        logger.warning(f"PoC generation failed: {e}")
        return ""


@observe(name="commitguard_compute_cvss")
def _compute_cvss(finding: dict) -> Tuple[Optional[str], Optional[str]]:
    prompt = (
        f"Finding:\n"
        f"Type: {finding['vuln_type']}\n"
        f"Description: {finding['description']}\n\n"
        + CVSS_PROMPT
    )
    try:
        raw = generate(MODEL_EXECUTE, prompt)
    except Exception as e:
        logger.warning(f"CVSS computation failed: {e}")
        return None, None

    cvss, cwe = None, None
    for line in raw.splitlines():
        if line.startswith("CVSS:"):
            cvss = line[len("CVSS:"):].strip() + " (AI-estimated, not validated)"
        elif line.startswith("CWE:"):
            cwe = line[len("CWE:"):].strip()
    return cvss, cwe


def _fire_webhook(finding: dict, webhook_url: str) -> bool:
    try:
        payload = {
            "text": (
                f"CommitGuard CONFIRMED: {finding['severity']} "
                f"{finding['vuln_type']} in {finding['file']}:{finding['line']}"
            ),
            "finding_id": finding["id"],
            "verdict": "CONFIRMED",
            "severity": finding["severity"],
            "file": finding["file"],
            "line": finding["line"],
        }
        resp = httpx.post(webhook_url, json=payload, timeout=10)
        return resp.status_code < 300
    except Exception as e:
        logger.warning(f"Webhook POST failed: {e}")
        return False


def verify(finding: dict, repo_url: str) -> dict:
    """
    Verify a single finding via E2B PoC execution.
    Called from CommitGuardWorkflow as a @DBOS.step().
    Returns VerifiedFinding dict.
    """
    webhook_url = os.environ.get("COMMITGUARD_WEBHOOK_URL", "")

    # Non-PoC-executable categories skip E2B entirely
    if finding["category"] not in POC_PROMPTS:
        cvss, cwe = _compute_cvss(finding)
        return VerifiedFinding(
            finding_id=finding["id"],
            file=finding["file"],
            line=finding["line"],
            severity=finding["severity"],
            vuln_type=finding["vuln_type"],
            category=finding["category"],
            description=finding["description"],
            verdict="UNVERIFIABLE",
            poc_summary="Category not PoC-executable without a live server.",
            cvss=cvss,
            cwe=cwe,
            webhook_fired=False,
        ).model_dump()

    poc_code = _generate_poc(finding)
    if not poc_code:
        cvss, cwe = _compute_cvss(finding)
        return VerifiedFinding(
            finding_id=finding["id"],
            file=finding["file"],
            line=finding["line"],
            severity=finding["severity"],
            vuln_type=finding["vuln_type"],
            category=finding["category"],
            description=finding["description"],
            verdict="UNVERIFIABLE",
            poc_summary="PoC generation returned empty script.",
            cvss=cvss,
            cwe=cwe,
            webhook_fired=False,
        ).model_dump()

    # Run PoC in E2B sandbox
    verdict = "UNVERIFIABLE"
    poc_summary = "E2B execution did not confirm the exploit."

    try:
        from e2b_code_interpreter import Sandbox
        with Sandbox(timeout=60) as sandbox:
            execution = sandbox.run_code(poc_code, timeout=30)
            stdout = "\n".join(execution.logs.stdout)
            if execution.error is None and EXPLOIT_MARKER in stdout:
                verdict = "CONFIRMED"
                poc_summary = f"PoC executed successfully. {EXPLOIT_MARKER} found in output."
            elif execution.error:
                poc_summary = f"PoC raised exception: {str(execution.error)[:200]}"
    except ImportError:
        verdict = "UNVERIFIABLE"
        poc_summary = "E2B not available (e2b_code_interpreter not installed)."
    except Exception as e:
        err = str(e)
        if "api key" in err.lower() or "authentication" in err.lower():
            verdict = "UNVERIFIABLE"
            poc_summary = "E2B API key not configured — mocked as UNVERIFIABLE."
        else:
            logger.warning(f"E2B execution error: {e}")
            verdict = "UNVERIFIABLE"
            poc_summary = f"E2B error: {err[:200]}"

    cvss, cwe = _compute_cvss(finding)

    # Fire webhook immediately on CONFIRMED, before returning
    webhook_fired = False
    if verdict == "CONFIRMED" and webhook_url:
        webhook_fired = _fire_webhook(finding, webhook_url)

    return VerifiedFinding(
        finding_id=finding["id"],
        file=finding["file"],
        line=finding["line"],
        severity=finding["severity"],
        vuln_type=finding["vuln_type"],
        category=finding["category"],
        description=finding["description"],
        verdict=verdict,
        poc_summary=poc_summary,
        cvss=cvss,
        cwe=cwe,
        webhook_fired=webhook_fired,
    ).model_dump()
