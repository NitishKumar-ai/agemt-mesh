"""
HFInternHarness — Hugging Face ML inference harness for ResearcherAgent.

Runs three lightweight ML tasks via the HF Serverless Inference API:

  Task 1 — NER (dslim/bert-base-NER)
    Extracts ORG and PRODUCT entities from finding text.
    Gives ContentWriterAgent real company/product names to reference
    instead of relying on the LLM to hallucinate them.

  Task 2 — Zero-shot risk classification (facebook/bart-large-mnli)
    Classifies finding severity as critical/high/medium/low WITHOUT
    fine-tuning. Seeds _research_finding() so the LLM prompt contains
    an ML-grounded prior rather than a cold guess.

  Task 3 — Sentence embedding (sentence-transformers/all-MiniLM-L6-v2)
    Produces a 384-d embedding of the audience string.
    Used by the deduplication gate at campaign creation time:
    if cosine similarity > 0.92 vs an existing campaign audience,
    the new campaign is blocked as a near-duplicate.

Fallback contract:
  Every task is wrapped in try/except with a hard timeout (default 5s).
  On any failure: return safe defaults, log HF_INTERN status, continue.
  The researcher pipeline never raises due to HF being offline.

Auth:
  Set HF_API_TOKEN in .env (free tier is sufficient for low-volume use).
  Without the token, HF rate-limits anonymous calls to ~10/hour.
  Pass token=None to run anonymously (useful in tests).
"""

import json
import logging
import math
import os
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ── Model IDs ─────────────────────────────────────────────────────────────────

_NER_MODEL = "dslim/bert-base-NER"
_CLASSIFIER_MODEL = "facebook/bart-large-mnli"
_EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

_HF_API_BASE = "https://api-inference.huggingface.co/models"

_RISK_LABELS = ["critical", "high", "medium", "low"]


# ── Harness class ─────────────────────────────────────────────────────────────

class HFInternHarness:
    """
    Thin wrapper around the HF Serverless Inference API.
    Instantiate once per DBOS step — httpx client is not shared across steps.

    Architecture:
      caller
        │
        ├─ ner(text)            → {"orgs": [...], "products": [...], "raw": [...]}
        ├─ classify_risk(text)  → {"risk_level": "high"|None, "score": float}
        └─ embed(text)          → list[float] | None
    """

    def __init__(self, api_token: Optional[str] = None, timeout: float = 5.0):
        token = api_token or os.environ.get("HF_API_TOKEN", "")
        self._headers = {"Authorization": f"Bearer {token}"} if token else {}
        self._timeout = timeout

    # ── Task 1: NER ───────────────────────────────────────────────────────────

    def ner(self, text: str) -> dict:
        """
        Run bert-base-NER on text, return extracted ORG and MISC (product) entities.

        HF NER response shape:
          [{"entity_group": "ORG", "word": "Acme Corp", "score": 0.98, ...}, ...]

        Returns:
          {"orgs": ["Acme Corp"], "products": ["OpenSSL"], "raw": [...]}
        """
        default = {"orgs": [], "products": [], "raw": []}
        try:
            resp = httpx.post(
                f"{_HF_API_BASE}/{_NER_MODEL}",
                headers=self._headers,
                json={"inputs": text[:1024]},  # cap to avoid 413
                timeout=self._timeout,
            )
            if resp.status_code == 503:
                # Model loading — expected on cold start, treat as transient
                logger.info("HF_INTERN: task=ner status=model_loading (503)")
                return default
            resp.raise_for_status()
            entities = resp.json()
            if not isinstance(entities, list):
                return default

            orgs, products = [], []
            for ent in entities:
                group = ent.get("entity_group", ent.get("entity", ""))
                word = ent.get("word", "").strip()
                score = ent.get("score", 0.0)
                if not word or score < 0.75:
                    continue
                if group == "ORG":
                    orgs.append(word)
                elif group in ("MISC", "PRODUCT"):
                    products.append(word)

            logger.info("HF_INTERN: task=ner status=ok orgs=%d products=%d", len(orgs), len(products))
            return {"orgs": _dedupe(orgs), "products": _dedupe(products), "raw": entities}

        except Exception as exc:
            logger.warning("HF_INTERN: task=ner status=fallback reason=%s", exc)
            return default

    # ── Task 2: Zero-shot risk classification ─────────────────────────────────

    def classify_risk(self, text: str) -> dict:
        """
        Zero-shot classify finding text against risk labels using bart-large-mnli.

        HF zero-shot response shape:
          {"labels": ["high", "critical", ...], "scores": [0.72, 0.15, ...]}

        Returns:
          {"risk_level": "high", "score": 0.72}
          {"risk_level": None, "score": 0.0}  ← on failure
        """
        default = {"risk_level": None, "score": 0.0}
        try:
            resp = httpx.post(
                f"{_HF_API_BASE}/{_CLASSIFIER_MODEL}",
                headers=self._headers,
                json={
                    "inputs": text[:512],
                    "parameters": {
                        "candidate_labels": _RISK_LABELS,
                        "multi_label": False,
                    },
                },
                timeout=self._timeout,
            )
            if resp.status_code == 503:
                logger.info("HF_INTERN: task=classify_risk status=model_loading (503)")
                return default
            resp.raise_for_status()
            data = resp.json()
            labels = data.get("labels", [])
            scores = data.get("scores", [])
            if not labels or not scores:
                return default

            top_label = labels[0]
            top_score = scores[0]
            # Only trust if confidence is meaningful (>40%)
            if top_score < 0.40:
                logger.info("HF_INTERN: task=classify_risk status=low_confidence score=%.2f", top_score)
                return {"risk_level": None, "score": top_score}

            logger.info("HF_INTERN: task=classify_risk status=ok risk=%s score=%.2f", top_label, top_score)
            return {"risk_level": top_label, "score": top_score}

        except Exception as exc:
            logger.warning("HF_INTERN: task=classify_risk status=fallback reason=%s", exc)
            return default

    # ── Task 3: Sentence embedding ────────────────────────────────────────────

    def embed(self, text: str) -> Optional[list[float]]:
        """
        Embed text using all-MiniLM-L6-v2, returning a 384-d float vector.
        Returns None on any failure — callers must handle None.

        HF feature-extraction response shape:
          [[0.12, -0.34, ...]]  ← list of lists (one per input sentence)
        """
        try:
            resp = httpx.post(
                f"{_HF_API_BASE}/{_EMBED_MODEL}",
                headers=self._headers,
                json={"inputs": text[:256]},
                timeout=self._timeout,
            )
            if resp.status_code == 503:
                logger.info("HF_INTERN: task=embed status=model_loading (503)")
                return None
            resp.raise_for_status()
            data = resp.json()
            # Response is [[float, ...]] — unwrap outer list
            if isinstance(data, list) and data and isinstance(data[0], list):
                vec = data[0]
            elif isinstance(data, list) and data and isinstance(data[0], float):
                vec = data
            else:
                logger.warning("HF_INTERN: task=embed status=unexpected_shape type=%s", type(data))
                return None

            logger.info("HF_INTERN: task=embed status=ok dims=%d", len(vec))
            return vec

        except Exception as exc:
            logger.warning("HF_INTERN: task=embed status=fallback reason=%s", exc)
            return None

    # ── Deduplication helper ──────────────────────────────────────────────────

    def deduplicate_audience(
        self,
        audience: str,
        prior_embeddings: list[list[float]],
        threshold: float = 0.92,
    ) -> tuple[bool, float]:
        """
        Check if `audience` is too similar to any prior campaign audience.

        Returns:
          (is_duplicate: bool, max_similarity: float)

        If embedding fails, returns (False, 0.0) — fail open (allow creation).
        """
        if not prior_embeddings:
            return False, 0.0

        vec = self.embed(audience)
        if vec is None:
            return False, 0.0

        max_sim = max(_cosine(vec, prior) for prior in prior_embeddings)
        is_dup = max_sim >= threshold
        if is_dup:
            logger.info(
                "HF_INTERN: dedup=blocked audience=%.40s max_sim=%.3f threshold=%.2f",
                audience, max_sim, threshold,
            )
        return is_dup, max_sim

    # ── Bulk enrich (convenience) ─────────────────────────────────────────────

    def enrich(self, finding_text: str, audience: str) -> dict:
        """
        Run NER + classify_risk in one call. Used by the _hf_enrich DBOS step.

        Returns:
          {
            "ner":  {"orgs": [...], "products": [...], "raw": [...]},
            "risk": {"risk_level": "high"|None, "score": float},
          }
        """
        return {
            "ner": self.ner(finding_text),
            "risk": self.classify_risk(finding_text),
        }


# ── Module-level singleton factory ────────────────────────────────────────────

def get_harness(timeout: float = 5.0) -> HFInternHarness:
    """Return a harness instance wired to env-var token."""
    return HFInternHarness(
        api_token=os.environ.get("HF_API_TOKEN"),
        timeout=timeout,
    )


# ── Math helpers ──────────────────────────────────────────────────────────────

def _cosine(a: list[float], b: list[float]) -> float:
    """Cosine similarity between two equal-length vectors."""
    if len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _dedupe(items: list[str]) -> list[str]:
    """Remove duplicates while preserving order."""
    seen: set[str] = set()
    out = []
    for item in items:
        key = item.lower()
        if key not in seen:
            seen.add(key)
            out.append(item)
    return out
