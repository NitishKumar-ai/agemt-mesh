"""
Marketing API integration tests.

Uses FastAPI TestClient + mocks for all DBOS/store calls so the suite
runs without a live database or DBOS initialisation.

Tests cover HTTP behaviour and route-level business logic only — the store
layer is tested separately (or via real DB integration tests).
"""

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient


@pytest.fixture()
def client():
    import api as api_module
    return TestClient(api_module.app)


# ── Store mock helpers ────────────────────────────────────────────────────────

def _mock_finding(finding_id=1, verified=False):
    return {
        "id": finding_id,
        "title": "SQL injection in login form",
        "summary": "User input concatenated into SQL query without sanitisation.",
        "evidence": "Semgrep rule sql-injection triggered on auth/db.py:42.",
        "severity": "high",
        "status": "verified" if verified else "review_required",
        "verified_by": "operator" if verified else None,
    }


def _mock_campaign(campaign_id=1, status="created"):
    return {
        "id": campaign_id,
        "name": "SQL injection outreach",
        "audience": "SaaS engineering leaders",
        "finding_summary": "SQL injection in login form.",
        "value_proposition": "Offer a free remediation review.",
        "channel": "email",
        "status": status,
        "subject": "Security review opportunity" if status == "review_required" else None,
        "body": "We found a critical issue..." if status == "review_required" else None,
        "approval_note": None,
        "source_finding_id": 1,
    }


# ── POST /api/security/findings ───────────────────────────────────────────────

class TestCreateSecurityFinding:
    def test_creates_finding_successfully(self, client):
        with patch("api.security_create_finding", return_value=1):
            resp = client.post("/api/security/findings", json={
                "title": "SQL injection",
                "summary": "SQL injection in login form",
                "evidence": "Semgrep confirmed.",
                "severity": "high",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["finding_id"] == 1
        assert data["status"] == "review_required"

    def test_rejects_missing_title(self, client):
        resp = client.post("/api/security/findings", json={
            "summary": "Some summary",
            "evidence": "Evidence here.",
        })
        assert resp.status_code == 400

    def test_rejects_invalid_severity(self, client):
        resp = client.post("/api/security/findings", json={
            "title": "Finding",
            "summary": "Summary",
            "evidence": "Evidence",
            "severity": "extreme",
        })
        assert resp.status_code == 400


# ── POST /api/security/findings/{id}/verify ───────────────────────────────────

class TestVerifySecurityFinding:
    def test_verifies_existing_finding(self, client):
        with patch("api.security_verify_finding", return_value=True):
            resp = client.post("/api/security/findings/1/verify", json={"verified_by": "operator"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "verified"

    def test_404_on_missing_finding(self, client):
        with patch("api.security_verify_finding", return_value=False):
            resp = client.post("/api/security/findings/999/verify", json={})
        assert resp.status_code == 404


# ── POST /api/marketing/campaigns ────────────────────────────────────────────

class TestCreateMarketingCampaign:
    def test_creates_campaign_for_verified_finding(self, client):
        with patch("api.marketing_list_audience_embeddings", return_value=[]), \
             patch("api.marketing_save_audience_embedding"), \
             patch("agents.marketing.hf_harness.get_harness") as mock_hf, \
             patch("api.marketing_create_campaign", return_value=(1, {})):
            mock_hf.return_value.deduplicate_audience.return_value = (False, 0.0)
            mock_hf.return_value.embed.return_value = None
            resp = client.post("/api/marketing/campaigns", json={
                "name": "Outreach campaign",
                "audience": "SaaS engineering leaders",
                "finding_summary": "SQL injection in login form.",
                "value_proposition": "Free remediation review.",
                "channel": "email",
                "source_finding_id": 1,
            })
        assert resp.status_code == 200
        assert resp.json()["campaign_id"] == 1

    def test_409_on_unverified_finding(self, client):
        with patch("api.marketing_list_audience_embeddings", return_value=[]), \
             patch("agents.marketing.hf_harness.get_harness") as mock_hf, \
             patch("api.marketing_create_campaign",
                   side_effect=ValueError("source_finding_not_verified")):
            mock_hf.return_value.deduplicate_audience.return_value = (False, 0.0)
            mock_hf.return_value.embed.return_value = None
            resp = client.post("/api/marketing/campaigns", json={
                "name": "Campaign",
                "audience": "Audience",
                "finding_summary": "Summary",
                "value_proposition": "Value",
                "channel": "email",
                "source_finding_id": 1,
            })
        assert resp.status_code == 409

    def test_409_on_duplicate_audience(self, client):
        with patch("api.marketing_list_audience_embeddings", return_value=[[0.1] * 384]), \
             patch("agents.marketing.hf_harness.get_harness") as mock_hf:
            mock_hf.return_value.deduplicate_audience.return_value = (True, 0.96)
            resp = client.post("/api/marketing/campaigns", json={
                "name": "Campaign",
                "audience": "SaaS engineering leaders",
                "finding_summary": "Summary",
                "value_proposition": "Value",
                "channel": "email",
                "source_finding_id": 1,
            })
        assert resp.status_code == 409

    def test_rejects_invalid_channel(self, client):
        resp = client.post("/api/marketing/campaigns", json={
            "name": "Campaign",
            "audience": "Audience",
            "finding_summary": "Summary",
            "value_proposition": "Value",
            "channel": "fax",
            "source_finding_id": 1,
        })
        assert resp.status_code == 400


# ── POST /api/marketing/campaigns/{id}/generate ──────────────────────────────

class TestGenerateCampaignDraft:
    def test_starts_pipeline_workflow(self, client):
        mock_handle = MagicMock()
        mock_handle.workflow_id = "wf-abc-123"
        # security_list_findings is re-imported locally inside the route handler,
        # so patch at the store module level to intercept both import paths.
        with patch("api.marketing_get_campaign", return_value=_mock_campaign()), \
             patch("store.security_list_findings", return_value=[_mock_finding(verified=True)]), \
             patch("api.DBOS.start_workflow", return_value=mock_handle):
            resp = client.post("/api/marketing/campaigns/1/generate")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "pipeline_started"
        assert data["workflow_id"] == "wf-abc-123"

    def test_404_on_missing_campaign(self, client):
        with patch("api.marketing_get_campaign", return_value=None):
            resp = client.post("/api/marketing/campaigns/999/generate")
        assert resp.status_code == 404


# ── POST /api/marketing/campaigns/{id}/approve ───────────────────────────────

class TestApproveCampaign:
    def test_approves_campaign_with_draft(self, client):
        with patch("api.marketing_approve_campaign", return_value="approved"):
            resp = client.post("/api/marketing/campaigns/1/approve",
                               json={"note": "Reviewed by operator"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "approved"

    def test_409_when_no_draft(self, client):
        with patch("api.marketing_approve_campaign", return_value="no_draft"):
            resp = client.post("/api/marketing/campaigns/1/approve", json={})
        assert resp.status_code == 409

    def test_404_on_missing_campaign(self, client):
        with patch("api.marketing_approve_campaign", return_value="not_found"):
            resp = client.post("/api/marketing/campaigns/999/approve", json={})
        assert resp.status_code == 404


# ── GET /api/marketing/campaigns ─────────────────────────────────────────────

class TestListCampaigns:
    def test_returns_campaign_list(self, client):
        with patch("api.marketing_list_campaigns", return_value=[_mock_campaign()]):
            resp = client.get("/api/marketing/campaigns")
        assert resp.status_code == 200
        campaigns = resp.json()["campaigns"]
        assert len(campaigns) == 1
        assert campaigns[0]["name"] == "SQL injection outreach"


# ── GET /api/marketing/audit-events ──────────────────────────────────────────

class TestListAuditEvents:
    def test_returns_events(self, client):
        events = [
            {"action": "finding_created", "payload": '{"finding_id": 1}'},
            {"action": "campaign_created", "payload": '{"campaign_id": 1}'},
        ]
        with patch("api.marketing_list_audit_events", return_value=events):
            resp = client.get("/api/marketing/audit-events")
        assert resp.status_code == 200
        data = resp.json()["events"]
        assert len(data) == 2
        assert data[0]["action"] == "finding_created"
        # payload should be deserialised from JSON string to dict
        assert isinstance(data[0]["payload"], dict)
