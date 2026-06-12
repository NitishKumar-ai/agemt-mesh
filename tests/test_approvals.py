import pytest
import json
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
import store

@pytest.fixture()
def client():
    import api as api_module
    return TestClient(api_module.app)

# ── API Tests ──────────────────────────────────────────────────────────────

class TestApprovalsAPI:
    def test_list_approvals(self, client):
        mock_approvals = [
            {
                "id": 1,
                "run_id": "run_1",
                "payload": {"risk_level": "high", "agent_id": "agent_1"},
                "created_at": datetime.utcnow().isoformat(),
                "status": "pending",
                "risk_level": "high",
                "requesting_agent": "agent_1"
            }
        ]
        with patch("api.approvals_list", return_value=mock_approvals):
            resp = client.get("/api/approvals")
        assert resp.status_code == 200
        data = resp.json()["approvals"]
        assert len(data) == 1
        assert data[0]["status"] == "pending"

    def test_decide_approval_success(self, client):
        with patch("api.record_approval_decision") as mock_record, \
             patch("api.DBOS.send") as mock_send:
            resp = client.post("/api/approvals/1/decide", json={
                "run_id": "run_1",
                "approved": True,
                "note": "looks good"
            })
        assert resp.status_code == 200
        assert resp.json()["status"] == "decided"
        mock_record.assert_called_once_with(1, "approved", "operator", {"note": "looks good"})
        mock_send.assert_called_once()

    def test_decide_approval_missing_run_id(self, client):
        resp = client.post("/api/approvals/1/decide", json={"approved": True})
        assert resp.status_code == 400

    def test_approval_history(self, client):
        mock_history = [
            {"action": "approved", "actor": "operator", "payload": {"note": "ok"}, "created_at": "..."}
        ]
        with patch("api.approval_get_history", return_value=mock_history):
            resp = client.get("/api/approvals/1/history")
        assert resp.status_code == 200
        assert resp.json()["history"][0]["action"] == "approved"

# ── Store Logic Tests ────────────────────────────────────────────────────────

class TestApprovalsStore:
    def test_approvals_list_logic(self):
        mock_session = MagicMock()
        with patch("store.DBOS") as mock_dbos:
            mock_dbos.sql_session = mock_session
            
            now = datetime.utcnow()
            rows_mapped = [
                {
                    "id": 1, 
                    "run_id": "run_1", 
                    "payload": json.dumps({"agent_id": "a1", "risk_level": "high"}), 
                    "created_at": now.isoformat()
                },
                {
                    "id": 2, 
                    "run_id": "run_2", 
                    "payload": json.dumps({"agent_id": "a2"}), 
                    "created_at": (now - timedelta(hours=25)).isoformat()
                }
            ]
            
            def execute_side_effect(query, params=None):
                q = str(query).lower()
                res = MagicMock()
                if "from agent_events" in q:
                    res.mappings.return_value.all.return_value = rows_mapped
                elif "from audit_events" in q:
                    res.mappings.return_value.first.return_value = None
                return res
                
            mock_session.execute.side_effect = execute_side_effect
            
            # Call the unwrapped function because @transaction requires DBOS context
            results = store.approvals_list.__wrapped__(limit=100)
            assert len(results) == 2
            assert results[0]["status"] == "pending"
            assert results[1]["status"] == "expired"
            assert results[0]["risk_level"] == "high"
            assert results[0]["requesting_agent"] == "a1"

    def test_approval_history_unwrapped(self):
        mock_session = MagicMock()
        with patch("store.DBOS") as mock_dbos:
            mock_dbos.sql_session = mock_session
            
            history_rows = [
                {"action": "approved", "actor": "operator", "payload": json.dumps({"note": "ok"}), "created_at": "..."}
            ]
            
            mock_res = MagicMock()
            mock_res.mappings.return_value.all.return_value = history_rows
            mock_session.execute.return_value = mock_res
            
            results = store.approval_get_history.__wrapped__(approval_id=1)
            assert len(results) == 1
            assert results[0]["action"] == "approved"
            assert results[0]["payload"]["note"] == "ok"
