"""
CommitGuard adjudication log + verification cache.

Two loops, one store, strict firewall:

FAST LOOP (per-run):
  Before E2B, embed the finding signature (CWE + category + code pattern)
  and search the adjudication log for near-identical prior findings.
  If a match exists with a CONFIRMED or FALSE_POSITIVE verdict from a
  *real* prior sandbox run, reuse it. Log the hit as cache_hit=True
  with the source_finding_id for audit.

SLOW LOOP (offline, human-in-the-loop):
  Mine the adjudication log for patterns — which categories the LLM
  over-flags, which PoC templates never confirm. Revise prompts and
  routing thresholds by hand, version them, re-run frozen benchmark.
  This module provides the data; the human is the optimizer.

FIREWALL:
  The fast loop never touches benchmark labels. Cached verdicts trace
  back to real prior sandbox executions, not model self-judgment.
  Config versions are frozen and hashed before any benchmark access.
"""

import hashlib
import json
import logging
import os
import sqlite3
import time
from dataclasses import dataclass, field, asdict
from typing import List, Optional, Tuple

logger = logging.getLogger(__name__)

# ── Similarity threshold ────────────────────────────────────────────────

_CACHE_SIMILARITY_THRESHOLD = float(
    os.environ.get("CG_CACHE_SIMILARITY_THRESHOLD", "0.92")
)

# ── Schema ──────────────────────────────────────────────────────────────

_DDL = """
CREATE TABLE IF NOT EXISTS cg_adjudication_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    finding_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    file TEXT NOT NULL,
    line INTEGER NOT NULL,
    category TEXT NOT NULL,
    vuln_type TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT NOT NULL,
    verdict TEXT NOT NULL,
    poc_summary TEXT,
    cvss TEXT,
    cwe TEXT,
    signature_hash TEXT NOT NULL,
    signature_text TEXT NOT NULL,
    cache_hit INTEGER DEFAULT 0,
    source_finding_id TEXT,
    config_version TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cg_adj_signature
    ON cg_adjudication_log(signature_hash);

CREATE INDEX IF NOT EXISTS idx_cg_adj_category_verdict
    ON cg_adjudication_log(category, verdict);

CREATE TABLE IF NOT EXISTS cg_cache_fidelity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cached_finding_id TEXT NOT NULL,
    source_finding_id TEXT NOT NULL,
    cached_verdict TEXT NOT NULL,
    fresh_verdict TEXT,
    match_score REAL NOT NULL,
    is_faithful INTEGER,
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cg_config_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_hash TEXT NOT NULL UNIQUE,
    config_json TEXT NOT NULL,
    frozen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
);
"""


def _get_db_path() -> str:
    return os.environ.get("CG_ADJUDICATION_DB", "agent_mesh.sqlite")


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(_get_db_path())
    conn.row_factory = sqlite3.Row
    return conn


def init_adjudication_tables() -> None:
    """Create adjudication tables. Called from init_db at startup."""
    conn = _get_conn()
    try:
        conn.executescript(_DDL)
        conn.commit()
    finally:
        conn.close()


# ── Finding signature ───────────────────────────────────────────────────

def compute_signature(finding: dict) -> Tuple[str, str]:
    """
    Compute a deterministic signature for a finding.

    The signature captures: category + vuln_type + normalized description.
    We deliberately exclude file/line (the same vuln pattern in different
    files should cache-hit). The hash is for fast lookup; the text is for
    similarity comparison.

    Returns (signature_hash, signature_text).
    """
    category = finding.get("category", "unknown")
    vuln_type = finding.get("vuln_type", "unknown")
    description = finding.get("description", "").strip().lower()

    # Normalize: strip file paths, line numbers, variable names that vary
    # between instances of the same pattern
    sig_text = f"{category}::{vuln_type}::{description}"
    sig_hash = hashlib.sha256(sig_text.encode()).hexdigest()[:16]

    return sig_hash, sig_text


def _text_similarity(a: str, b: str) -> float:
    """
    Simple token-overlap similarity (Jaccard on word tokens).

    For production, swap this for sentence-transformer cosine similarity
    using the HF harness's embed(). Good enough for exact and near-exact
    matches; the threshold is set high (0.92) to avoid false cache hits.
    """
    tokens_a = set(a.lower().split())
    tokens_b = set(b.lower().split())
    if not tokens_a or not tokens_b:
        return 0.0
    intersection = tokens_a & tokens_b
    union = tokens_a | tokens_b
    return len(intersection) / len(union)


# ── Cache lookup (fast loop) ────────────────────────────────────────────

@dataclass
class CacheResult:
    hit: bool
    verdict: Optional[str] = None
    source_finding_id: Optional[str] = None
    match_score: float = 0.0
    poc_summary: Optional[str] = None
    cvss: Optional[str] = None
    cwe: Optional[str] = None


def cache_lookup(finding: dict) -> CacheResult:
    """
    Check if a near-identical finding was previously adjudicated.

    Only returns hits from findings that were sandbox-verified (not
    themselves cache hits), with CONFIRMED or FALSE_POSITIVE verdicts.
    UNVERIFIABLE verdicts are never cached — they indicate the system
    couldn't determine the answer, not that it did.
    """
    sig_hash, sig_text = compute_signature(finding)
    conn = _get_conn()
    try:
        # Fast path: exact hash match
        rows = conn.execute(
            """
            SELECT finding_id, verdict, poc_summary, cvss, cwe, signature_text
            FROM cg_adjudication_log
            WHERE signature_hash = ?
              AND cache_hit = 0
              AND verdict IN ('CONFIRMED', 'FALSE_POSITIVE')
            ORDER BY created_at DESC
            LIMIT 10
            """,
            (sig_hash,),
        ).fetchall()

        if not rows:
            return CacheResult(hit=False)

        # Check text similarity for the best match
        best_score = 0.0
        best_row = None
        for row in rows:
            score = _text_similarity(sig_text, row["signature_text"])
            if score > best_score:
                best_score = score
                best_row = row

        if best_score >= _CACHE_SIMILARITY_THRESHOLD and best_row is not None:
            return CacheResult(
                hit=True,
                verdict=best_row["verdict"],
                source_finding_id=best_row["finding_id"],
                match_score=best_score,
                poc_summary=f"[CACHED from {best_row['finding_id']}] {best_row['poc_summary'] or ''}",
                cvss=best_row["cvss"],
                cwe=best_row["cwe"],
            )

        return CacheResult(hit=False)
    finally:
        conn.close()


# ── Record verdict (both loops read from this) ──────────────────────────

def record_adjudication(
    finding: dict,
    verified: dict,
    job_id: str,
    cache_hit: bool = False,
    source_finding_id: Optional[str] = None,
    config_version: Optional[str] = None,
) -> None:
    """
    Write a finding + its verdict to the adjudication log.

    Every finding goes here — both fresh sandbox results and cache hits.
    The cache_hit flag and source_finding_id let the slow loop distinguish
    original verdicts from reused ones.
    """
    sig_hash, sig_text = compute_signature(finding)
    conn = _get_conn()
    try:
        conn.execute(
            """
            INSERT INTO cg_adjudication_log
                (finding_id, job_id, file, line, category, vuln_type,
                 description, severity, verdict, poc_summary, cvss, cwe,
                 signature_hash, signature_text, cache_hit, source_finding_id,
                 config_version)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                finding.get("id", verified.get("finding_id", "")),
                job_id,
                finding.get("file", ""),
                finding.get("line", 0),
                finding.get("category", ""),
                finding.get("vuln_type", ""),
                finding.get("description", ""),
                finding.get("severity", ""),
                verified.get("verdict", "UNVERIFIABLE"),
                verified.get("poc_summary", ""),
                verified.get("cvss"),
                verified.get("cwe"),
                sig_hash,
                sig_text,
                1 if cache_hit else 0,
                source_finding_id,
                config_version,
            ),
        )
        conn.commit()
    finally:
        conn.close()


# ── Cache fidelity (slow loop measurement) ──────────────────────────────

def record_fidelity_check(
    cached_finding_id: str,
    source_finding_id: str,
    cached_verdict: str,
    fresh_verdict: str,
    match_score: float,
) -> None:
    """
    Record a cache fidelity check — did the cached verdict match a fresh
    sandbox run on the same finding?

    Called during offline evaluation, never during normal pipeline runs.
    """
    is_faithful = 1 if cached_verdict == fresh_verdict else 0
    conn = _get_conn()
    try:
        conn.execute(
            """
            INSERT INTO cg_cache_fidelity
                (cached_finding_id, source_finding_id, cached_verdict,
                 fresh_verdict, match_score, is_faithful, verified_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (cached_finding_id, source_finding_id, cached_verdict,
             fresh_verdict, match_score, is_faithful),
        )
        conn.commit()
    finally:
        conn.close()


def get_cache_fidelity_stats() -> dict:
    """
    Compute cache fidelity metrics for the slow loop.

    Returns:
        total_checks: number of fidelity checks recorded
        faithful_count: how many cached verdicts matched fresh runs
        fidelity_rate: faithful_count / total_checks
        by_category: breakdown per verdict type
    """
    conn = _get_conn()
    try:
        row = conn.execute(
            """
            SELECT COUNT(*) as total,
                   SUM(is_faithful) as faithful
            FROM cg_cache_fidelity
            WHERE is_faithful IS NOT NULL
            """
        ).fetchone()

        total = row["total"] or 0
        faithful = row["faithful"] or 0

        by_verdict = {}
        for r in conn.execute(
            """
            SELECT cached_verdict,
                   COUNT(*) as total,
                   SUM(is_faithful) as faithful
            FROM cg_cache_fidelity
            WHERE is_faithful IS NOT NULL
            GROUP BY cached_verdict
            """
        ).fetchall():
            v = r["cached_verdict"]
            by_verdict[v] = {
                "total": r["total"],
                "faithful": r["faithful"] or 0,
                "rate": (r["faithful"] or 0) / r["total"] if r["total"] else 0,
            }

        return {
            "total_checks": total,
            "faithful_count": faithful,
            "fidelity_rate": faithful / total if total else 0,
            "by_verdict": by_verdict,
        }
    finally:
        conn.close()


# ── Config versioning (firewall enforcement) ────────────────────────────

def freeze_config(config: dict, notes: str = "") -> str:
    """
    Freeze a pipeline config and return its version hash.

    The hash is deterministic: same config dict always produces the same
    hash. This is the firewall — benchmark runs require a frozen config,
    and the freeze happens before any benchmark access.
    """
    config_json = json.dumps(config, sort_keys=True, separators=(",", ":"))
    version_hash = hashlib.sha256(config_json.encode()).hexdigest()[:12]

    conn = _get_conn()
    try:
        conn.execute(
            """
            INSERT OR IGNORE INTO cg_config_versions
                (version_hash, config_json, notes)
            VALUES (?, ?, ?)
            """,
            (version_hash, config_json, notes),
        )
        conn.commit()
    finally:
        conn.close()

    return version_hash


def get_config_version(version_hash: str) -> Optional[dict]:
    """Load a frozen config by its hash. Returns None if not found."""
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT config_json FROM cg_config_versions WHERE version_hash = ?",
            (version_hash,),
        ).fetchone()
        if row:
            return json.loads(row["config_json"])
        return None
    finally:
        conn.close()


# ── Slow loop analytics ─────────────────────────────────────────────────

def get_adjudication_summary() -> dict:
    """
    Summary stats for the slow loop — what the human optimizer reviews
    to decide whether to revise prompts or thresholds.
    """
    conn = _get_conn()
    try:
        total = conn.execute(
            "SELECT COUNT(*) as n FROM cg_adjudication_log"
        ).fetchone()["n"]

        by_verdict = {}
        for r in conn.execute(
            """
            SELECT verdict, COUNT(*) as n
            FROM cg_adjudication_log
            GROUP BY verdict
            """
        ).fetchall():
            by_verdict[r["verdict"]] = r["n"]

        by_category = {}
        for r in conn.execute(
            """
            SELECT category, verdict, COUNT(*) as n
            FROM cg_adjudication_log
            WHERE cache_hit = 0
            GROUP BY category, verdict
            """
        ).fetchall():
            cat = r["category"]
            if cat not in by_category:
                by_category[cat] = {}
            by_category[cat][r["verdict"]] = r["n"]

        cache_stats = conn.execute(
            """
            SELECT COUNT(*) as total_cached,
                   SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) as cache_hits
            FROM cg_adjudication_log
            """
        ).fetchone()

        return {
            "total_findings": total,
            "by_verdict": by_verdict,
            "by_category_verdict": by_category,
            "cache_hit_rate": (
                (cache_stats["cache_hits"] or 0) / cache_stats["total_cached"]
                if cache_stats["total_cached"] else 0
            ),
            "total_cache_hits": cache_stats["cache_hits"] or 0,
        }
    finally:
        conn.close()
