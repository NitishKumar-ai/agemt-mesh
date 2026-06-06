"""
Tests for agents/marketing/hf_harness.py

All HF API calls are mocked — no network required, no HF_API_TOKEN needed.
Tests cover happy paths, fallbacks (timeout/503/bad shape), and the
deduplication logic.
"""
import json
import math
import pytest
from unittest.mock import MagicMock, patch

from agents.marketing.hf_harness import HFInternHarness, _cosine, _dedupe, get_harness


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def harness():
    """HFInternHarness with no token (avoids env dependency)."""
    return HFInternHarness(api_token=None, timeout=5.0)


def _mock_response(json_data, status_code=200):
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_data
    resp.raise_for_status = MagicMock()
    if status_code >= 400:
        resp.raise_for_status.side_effect = Exception(f"HTTP {status_code}")
    return resp


# ── Task 1: NER ───────────────────────────────────────────────────────────────

class TestNER:
    def test_happy_path_extracts_orgs_and_products(self, harness):
        ner_response = [
            {"entity_group": "ORG",  "word": "Acme Corp", "score": 0.98},
            {"entity_group": "ORG",  "word": "Acme Corp", "score": 0.95},  # duplicate
            {"entity_group": "MISC", "word": "OpenSSL",   "score": 0.91},
            {"entity_group": "PER",  "word": "Alice",     "score": 0.99},  # ignored
        ]
        with patch("httpx.post", return_value=_mock_response(ner_response)):
            result = harness.ner("Acme Corp uses OpenSSL")

        assert result["orgs"] == ["Acme Corp"]          # deduped
        assert result["products"] == ["OpenSSL"]
        assert len(result["raw"]) == 4

    def test_low_score_entities_filtered(self, harness):
        ner_response = [
            {"entity_group": "ORG", "word": "Sketchy Inc", "score": 0.50},  # below 0.75
        ]
        with patch("httpx.post", return_value=_mock_response(ner_response)):
            result = harness.ner("some text")

        assert result["orgs"] == []

    def test_fallback_on_timeout(self, harness):
        with patch("httpx.post", side_effect=TimeoutError("timed out")):
            result = harness.ner("some finding text")

        assert result == {"orgs": [], "products": [], "raw": []}

    def test_fallback_on_503_model_loading(self, harness):
        with patch("httpx.post", return_value=_mock_response({}, status_code=503)):
            result = harness.ner("some text")

        assert result == {"orgs": [], "products": [], "raw": []}

    def test_fallback_on_unexpected_response_shape(self, harness):
        with patch("httpx.post", return_value=_mock_response({"error": "oops"})):
            result = harness.ner("text")

        # Non-list response → fallback
        assert result["orgs"] == []
        assert result["products"] == []


# ── Task 2: Zero-shot risk classification ─────────────────────────────────────

class TestClassifyRisk:
    def test_happy_path_returns_top_label(self, harness):
        clf_response = {
            "labels": ["high", "critical", "medium", "low"],
            "scores": [0.72,    0.15,      0.08,     0.05],
        }
        with patch("httpx.post", return_value=_mock_response(clf_response)):
            result = harness.classify_risk("SQL injection vulnerability found")

        assert result["risk_level"] == "high"
        assert abs(result["score"] - 0.72) < 0.001

    def test_low_confidence_returns_none_risk(self, harness):
        clf_response = {
            "labels": ["medium", "low", "high", "critical"],
            "scores": [0.35,     0.30,  0.20,   0.15],
        }
        with patch("httpx.post", return_value=_mock_response(clf_response)):
            result = harness.classify_risk("some vague issue")

        assert result["risk_level"] is None  # below 0.40 threshold

    def test_fallback_on_http_error(self, harness):
        with patch("httpx.post", side_effect=Exception("connection refused")):
            result = harness.classify_risk("finding text")

        assert result == {"risk_level": None, "score": 0.0}

    def test_fallback_on_503(self, harness):
        with patch("httpx.post", return_value=_mock_response({}, status_code=503)):
            result = harness.classify_risk("text")

        assert result["risk_level"] is None

    def test_fallback_on_empty_response(self, harness):
        with patch("httpx.post", return_value=_mock_response({"labels": [], "scores": []})):
            result = harness.classify_risk("text")

        assert result["risk_level"] is None
        assert result["score"] == 0.0


# ── Task 3: Sentence embedding ────────────────────────────────────────────────

class TestEmbed:
    def test_happy_path_returns_vector(self, harness):
        vec = [0.1, -0.2, 0.3] * 128  # 384-d
        with patch("httpx.post", return_value=_mock_response([vec])):
            result = harness.embed("engineering leaders at SaaS companies")

        assert result is not None
        assert len(result) == 384
        assert abs(result[0] - 0.1) < 0.001

    def test_flat_list_response_accepted(self, harness):
        """Some HF endpoints return a flat list instead of list-of-lists."""
        vec = [0.5] * 384
        with patch("httpx.post", return_value=_mock_response(vec)):
            result = harness.embed("audience")

        assert result is not None
        assert len(result) == 384

    def test_fallback_returns_none_on_timeout(self, harness):
        with patch("httpx.post", side_effect=TimeoutError()):
            result = harness.embed("text")

        assert result is None

    def test_fallback_returns_none_on_503(self, harness):
        with patch("httpx.post", return_value=_mock_response({}, status_code=503)):
            result = harness.embed("text")

        assert result is None


# ── Deduplication ─────────────────────────────────────────────────────────────

class TestDeduplicateAudience:
    def _unit_vec(self, n=384, val=1.0):
        """Return a normalised vector (all same value for easy cosine math)."""
        mag = math.sqrt(n * val * val)
        return [val / mag] * n

    def test_duplicate_blocked_above_threshold(self, harness):
        vec = self._unit_vec()
        with patch("httpx.post", return_value=_mock_response([vec])):
            is_dup, sim = harness.deduplicate_audience("same audience", [vec], threshold=0.92)

        assert is_dup is True
        assert sim > 0.92

    def test_distinct_audience_allowed(self, harness):
        vec_a = [1.0] + [0.0] * 383
        vec_b = [0.0, 1.0] + [0.0] * 382  # orthogonal
        with patch("httpx.post", return_value=_mock_response([vec_a])):
            is_dup, sim = harness.deduplicate_audience("different audience", [vec_b], threshold=0.92)

        assert is_dup is False
        assert sim < 0.01

    def test_no_prior_embeddings_always_allowed(self, harness):
        is_dup, sim = harness.deduplicate_audience("any audience", [], threshold=0.92)
        assert is_dup is False
        assert sim == 0.0

    def test_embed_failure_fails_open(self, harness):
        """If embedding fails, dedup must NOT block campaign creation."""
        with patch("httpx.post", side_effect=Exception("HF down")):
            is_dup, sim = harness.deduplicate_audience("audience", [[0.1] * 384])

        assert is_dup is False  # fail open
        assert sim == 0.0


# ── Bulk enrich ───────────────────────────────────────────────────────────────

class TestEnrich:
    def test_enrich_returns_both_results(self, harness):
        ner_resp = [{"entity_group": "ORG", "word": "Acme", "score": 0.95}]
        clf_resp = {"labels": ["critical", "high"], "scores": [0.80, 0.15]}

        responses = iter([
            _mock_response(ner_resp),
            _mock_response(clf_resp),
        ])
        with patch("httpx.post", side_effect=lambda *a, **kw: next(responses)):
            result = harness.enrich("SQL injection in Acme login form", "SaaS CTOs")

        assert result["ner"]["orgs"] == ["Acme"]
        assert result["risk"]["risk_level"] == "critical"

    def test_enrich_survives_partial_failure(self, harness):
        """NER fails, classifier succeeds — enrich still returns both keys."""
        clf_resp = {"labels": ["high"], "scores": [0.85]}
        responses = iter([
            _mock_response({}, status_code=503),   # NER → 503
            _mock_response(clf_resp),               # classifier → ok
        ])
        with patch("httpx.post", side_effect=lambda *a, **kw: next(responses)):
            result = harness.enrich("finding", "audience")

        assert result["ner"]["orgs"] == []          # safe fallback
        assert result["risk"]["risk_level"] == "high"


# ── Researcher integration: no HF_API_TOKEN set ───────────────────────────────

class TestResearcherNoToken:
    def test_get_harness_works_without_token(self, monkeypatch):
        """get_harness() must not raise even when HF_API_TOKEN is unset."""
        monkeypatch.delenv("HF_API_TOKEN", raising=False)
        h = get_harness()
        assert isinstance(h, HFInternHarness)
        assert h._headers == {}  # anonymous


# ── Math helpers ──────────────────────────────────────────────────────────────

class TestHelpers:
    def test_cosine_identical_vectors(self):
        v = [1.0, 0.0, 0.0]
        assert abs(_cosine(v, v) - 1.0) < 1e-9

    def test_cosine_orthogonal_vectors(self):
        assert abs(_cosine([1, 0], [0, 1])) < 1e-9

    def test_cosine_zero_vector_returns_zero(self):
        assert _cosine([0, 0], [1, 2]) == 0.0

    def test_cosine_length_mismatch_returns_zero(self):
        assert _cosine([1, 2], [1, 2, 3]) == 0.0

    def test_dedupe_preserves_order(self):
        assert _dedupe(["B", "A", "B", "C", "a"]) == ["B", "A", "C"]
