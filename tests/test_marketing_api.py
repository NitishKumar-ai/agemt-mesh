import asyncio

import api
import pytest
from fastapi import HTTPException


def test_marketing_campaign_lifecycle(monkeypatch, tmp_path):
    database = tmp_path / "marketing.sqlite"
    monkeypatch.setattr(api, "DB_PATH", str(database))
    api.on_startup()

    finding = asyncio.run(
        api.create_security_finding(
            {
                "title": "Verified dependency finding",
                "summary": "A verified dependency pattern increases upgrade risk.",
                "evidence": "Scanner output reviewed by operator.",
                "severity": "medium",
            }
        )
    )
    asyncio.run(api.verify_security_finding(finding["finding_id"], {"verified_by": "operator"}))

    created = asyncio.run(
        api.create_marketing_campaign(
            {
                "name": "Verified dependency finding",
                "audience": "SaaS engineering leaders",
                "finding_summary": "A verified dependency pattern increases upgrade risk.",
                "value_proposition": "Provide an evidence-backed remediation review.",
                "channel": "email",
                "source_finding_id": finding["finding_id"],
            }
        )
    )
    campaign_id = created["campaign_id"]

    generated = asyncio.run(api.generate_marketing_campaign(campaign_id))
    assert generated["status"] == "review_required"
    assert generated["subject"]
    assert generated["body"]

    approved = asyncio.run(
        api.approve_marketing_campaign(campaign_id, {"note": "Reviewed by operator"})
    )
    assert approved["status"] == "approved"

    campaigns = asyncio.run(api.list_marketing_campaigns())["campaigns"]
    assert campaigns[0]["status"] == "approved"
    assert campaigns[0]["approval_note"] == "Reviewed by operator"
    audit_actions = [
        event["action"]
        for event in asyncio.run(api.list_marketing_audit_events())["events"]
    ]
    assert "finding_created" in audit_actions
    assert "finding_verified" in audit_actions
    assert "campaign_created" in audit_actions
    assert "draft_generated" in audit_actions
    assert "campaign_approved" in audit_actions


def test_campaign_requires_verified_source_finding(monkeypatch, tmp_path):
    database = tmp_path / "finding-handoff.sqlite"
    monkeypatch.setattr(api, "DB_PATH", str(database))
    api.on_startup()

    finding = asyncio.run(
        api.create_security_finding(
            {
                "title": "Outdated dependency pattern",
                "summary": "A verified dependency pattern increases remediation risk.",
                "evidence": "Dependency lockfile and scanner output reviewed by CommitGuard.",
                "severity": "high",
                "repository": "example/service",
            }
        )
    )
    payload = {
        "name": "Dependency remediation campaign",
        "audience": "SaaS engineering leaders",
        "finding_summary": "This value must be replaced by the verified finding.",
        "value_proposition": "Provide a remediation plan.",
        "channel": "email",
        "source_finding_id": finding["finding_id"],
    }

    with pytest.raises(HTTPException) as exc:
        asyncio.run(api.create_marketing_campaign(payload))
    assert exc.value.status_code == 409

    asyncio.run(api.verify_security_finding(finding["finding_id"], {"verified_by": "operator"}))
    created = asyncio.run(api.create_marketing_campaign(payload))
    assert created["status"] == "created"

    campaigns = asyncio.run(api.list_marketing_campaigns())["campaigns"]
    assert campaigns[0]["source_finding_id"] == finding["finding_id"]
    assert campaigns[0]["finding_summary"] == "A verified dependency pattern increases remediation risk."
