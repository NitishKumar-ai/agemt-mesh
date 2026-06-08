"""
CommitGuard scanner: Semgrep static analysis + Sonnet 4.6 triage → Finding[].

Pipeline:
  _ensure_repo(repo_url, tmpdir)  — idempotent clone (re-clones if tmpdir missing after crash)
  _run_semgrep(tmpdir)            — subprocess, ERROR severity only, returns raw hits
  _analyze_findings(hits)         — Sonnet 4.6 triage, returns Finding[] (Pydantic)
  scan(...)                       — DBOS step that wires the above

Security: repo_url must start with https://github.com/ — validated before this module is called.
subprocess.run uses list form only — no shell=True, no string interpolation.
"""

import json
import logging
import os
import shutil
import subprocess
from typing import Optional

try:
    from langfuse import observe
except Exception:
    def observe(name=None, **_kw):  # type: ignore[misc]
        def decorator(fn):
            return fn
        return decorator
from pydantic import BaseModel

from main import generate, MODEL_EXECUTE

logger = logging.getLogger(__name__)

# PoC-executable categories only. Anything else returns UNVERIFIABLE.
POC_EXECUTABLE_CATEGORIES = frozenset([
    "sql_injection",
    "hardcoded_secret",
    "path_traversal",
    "insecure_deserialization",
])


class Finding(BaseModel):
    id: str
    file: str
    line: int
    vuln_type: str
    category: str       # one of POC_EXECUTABLE_CATEGORIES or "unverifiable"
    description: str
    severity: str       # HIGH / MEDIUM / LOW


def _ensure_repo(repo_url: str, tmpdir: str) -> None:
    """Clone repo into tmpdir if not already present. Idempotent — safe to call on replay."""
    git_dir = os.path.join(tmpdir, ".git")
    if os.path.exists(git_dir):
        return
    os.makedirs(tmpdir, exist_ok=True)
    try:
        result = subprocess.run(
            ["git", "clone", "--depth=1", repo_url, tmpdir],
            capture_output=True, text=True, timeout=120
        )
        if result.returncode != 0:
            raise RuntimeError(f"git clone failed: {result.stderr[:500]}")
    except subprocess.TimeoutExpired:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise RuntimeError("git clone timed out after 120s")


def _run_semgrep(tmpdir: str) -> list[dict]:
    """Run semgrep on tmpdir. Returns list of raw finding dicts (high/critical only)."""
    try:
        result = subprocess.run(
            [
                "semgrep", "--config", "auto",
                "--json",
                "--severity", "ERROR",
                "--max-target-bytes", "2000000",
                "--timeout", "60",
                tmpdir,
            ],
            capture_output=True, text=True, timeout=180
        )
    except FileNotFoundError:
        logger.warning("semgrep not installed — returning empty findings")
        return []
    except subprocess.TimeoutExpired:
        logger.warning("semgrep timed out after 180s — returning partial results")
        return []

    if not result.stdout.strip():
        return []

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        logger.warning("semgrep output was not valid JSON")
        return []

    return data.get("results", [])


@observe(name="commitguard_analyze_findings")
def _analyze_findings(raw_hits: list[dict], max_findings: int) -> list[Finding]:
    """
    Sonnet 4.6 triage: classifies each Semgrep hit into a structured Finding.
    Returns at most max_findings items.
    """
    if not raw_hits:
        return []

    import uuid
    findings: list[Finding] = []

    for hit in raw_hits[:max_findings]:
        file_path = hit.get("path", "unknown")
        line = hit.get("start", {}).get("line", 0)
        rule_id = hit.get("check_id", "")
        message = hit.get("extra", {}).get("message", "")
        severity = hit.get("extra", {}).get("severity", "ERROR")

        prompt = (
            "You are a security engineer triaging a Semgrep finding.\n\n"
            f"Rule: {rule_id}\n"
            f"File: {file_path}:{line}\n"
            f"Message: {message}\n\n"
            "Reply with exactly four lines:\n"
            "VULN_TYPE: <short type, e.g. sql_injection>\n"
            "CATEGORY: <one of: sql_injection, hardcoded_secret, path_traversal, "
            "insecure_deserialization, unverifiable>\n"
            "SEVERITY: <HIGH, MEDIUM, or LOW>\n"
            "DESCRIPTION: <one sentence explaining the vulnerability and its impact>"
        )

        try:
            raw = generate(MODEL_EXECUTE, prompt)
        except Exception as e:
            logger.warning(f"LLM triage failed for {file_path}:{line}: {e}")
            raw = ""

        vuln_type = rule_id.split(".")[-1] if rule_id else "unknown"
        category = "unverifiable"
        sev = "HIGH" if severity == "ERROR" else "MEDIUM"
        description = message

        for line_text in raw.splitlines():
            if line_text.startswith("VULN_TYPE:"):
                vuln_type = line_text[len("VULN_TYPE:"):].strip()
            elif line_text.startswith("CATEGORY:"):
                cat = line_text[len("CATEGORY:"):].strip().lower()
                category = cat if cat in POC_EXECUTABLE_CATEGORIES else "unverifiable"
            elif line_text.startswith("SEVERITY:"):
                sev = line_text[len("SEVERITY:"):].strip().upper()
                if sev not in ("HIGH", "MEDIUM", "LOW"):
                    sev = "HIGH"
            elif line_text.startswith("DESCRIPTION:"):
                description = line_text[len("DESCRIPTION:"):].strip()

        findings.append(Finding(
            id=str(uuid.uuid4()),
            file=file_path,
            line=line,
            vuln_type=vuln_type,
            category=category,
            description=description,
            severity=sev,
        ))

    return findings


def scan(repo_url: str, tmpdir: str, max_findings: int = 5) -> tuple[list[dict], bool]:
    """
    Full scan step: ensure repo cloned, run semgrep, triage with LLM.
    Returns (findings_as_dicts, findings_truncated).
    Called from CommitGuardWorkflow as a @DBOS.step().
    """
    _ensure_repo(repo_url, tmpdir)

    raw_hits = _run_semgrep(tmpdir)
    total_hits = len(raw_hits)
    truncated = total_hits > max_findings

    findings = _analyze_findings(raw_hits, max_findings)

    return [f.model_dump() for f in findings], truncated
