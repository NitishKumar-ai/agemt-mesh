import pytest
import json
from datetime import datetime
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from store import killswitch_get, killswitch_set, killswitch_get_full_state, KillswitchEngaged
from api import app

# ── Store Tests ──────────────────────────────────────────────────────────────

@pytest.fixture
def mock_dbos():
    with patch("dbos.DBOS.sql_session") as mock_session:
        yield mock_session

def test_killswitch_store_get_set(mock_dbos):
    # Mocking select
    mock_dbos.execute.return_value.fetchone.return_value = (1,)
    assert killswitch_get() is True
    
    # Mocking engaged=0
    mock_dbos.execute.return_value.fetchone.return_value = (0,)
    assert killswitch_get() is False

def test_killswitch_store_get_full_state(mock_dbos):
    now = datetime.utcnow()
    mock_dbos.execute.return_value.fetchone.return_value = (1, now, "admin", "emergency", now)
    
    state = killswitch_get_full_state()
    assert state["engaged"] is True
    assert state["engaged_by"] == "admin"
    assert state["reason"] == "emergency"

def test_killswitch_store_set(mock_dbos):
    killswitch_set(True, engaged_by="operator", reason="test")
    
    # Verify update called
    calls = mock_dbos.execute.call_args_list
    update_call = next(c for c in calls if "UPDATE killswitch_state" in str(c.args[0]))
    assert update_call.args[1]["val"] == 1
    assert update_call.args[1]["by"] == "operator"
    assert update_call.args[1]["reason"] == "test"
    
    # Verify audit called
    audit_call = next(c for c in calls if "INSERT INTO marketing_audit_events" in str(c.args[0]))
    assert audit_call.args[1]["etype"] == "system"
    assert audit_call.args[1]["action"] == "killswitch_engaged"

# ── API Tests ────────────────────────────────────────────────────────────────

client = TestClient(app)

def test_api_get_killswitch():
    with patch("api.killswitch_get_full_state") as mock_get:
        mock_get.return_value = {"engaged": True, "reason": "test"}
        response = client.get("/api/killswitch")
        assert response.status_code == 200
        assert response.json()["engaged"] is True

def test_api_post_killswitch():
    with patch("api.killswitch_set") as mock_set, \
         patch("api.killswitch_get_full_state") as mock_get:
        mock_get.return_value = {"engaged": True, "reason": "emergency"}
        response = client.post("/api/killswitch", json={"engaged": True, "reason": "emergency", "engaged_by": "admin"})
        assert response.status_code == 200
        assert response.json()["killswitch_active"] is True
        mock_set.assert_called_once_with(True, engaged_by="admin", reason="emergency")

def test_api_delete_killswitch():
    with patch("api.killswitch_set") as mock_set, \
         patch("api.killswitch_get_full_state") as mock_get:
        mock_get.return_value = {"engaged": False}
        response = client.delete("/api/killswitch")
        assert response.status_code == 200
        assert response.json()["killswitch_active"] is False
        mock_set.assert_called_once_with(False, engaged_by="operator", reason="Disengaged via dashboard")

# ── Gating Tests ─────────────────────────────────────────────────────────────

def test_workflow_gating():
    from main import scan_suggested_tasks
    with patch("main.killswitch_get", return_value=True):
        with pytest.raises(KillswitchEngaged):
            # We call the wrapped function directly because DBOS workflows 
            # expect a context when called as workflows.
            scan_suggested_tasks.__wrapped__("repo_root")

def test_dispatcher_gating():
    from main import scheduled_dispatcher
    with patch("main.check_killswitch", side_effect=KillswitchEngaged("halted")), \
         patch("store.schedule_get_due") as mock_due:
        scheduled_dispatcher.__wrapped__(datetime.utcnow(), datetime.utcnow())
        mock_due.assert_not_called()

def test_harness_gating():
    from harness import BaseAgent, AgentConfig
    
    class MockAgent(BaseAgent):
        def get_tools(self): return []
        def execute(self, plan, run_id): return {}

    agent = MockAgent(goal="test", config=AgentConfig(agent_id="test"))
    with patch("store.killswitch_get", return_value=True):
        with pytest.raises(KillswitchEngaged):
            agent.check_killswitch()
