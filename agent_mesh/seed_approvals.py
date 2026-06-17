import json
import sqlite3
from datetime import datetime, timedelta

def seed():
    conn = sqlite3.connect("agent_mesh.sqlite")
    cursor = conn.cursor()

    # Create tables if not exists (though api.py should do this)
    # But just in case we are running standalone
    
    # 1. Clear existing approvals for demo
    cursor.execute("DELETE FROM agent_events WHERE event_type = 'approval_required'")
    cursor.execute("DELETE FROM audit_events WHERE entity_type = 'approval'")

    now = datetime.utcnow()

    # 2. Add some pending approvals
    approvals = [
        {
            "run_id": "run_123",
            "agent_id": "commitguard",
            "risk_level": "high",
            "payload": {
                "agent_id": "commitguard",
                "risk_level": "high",
                "reason": "Suspicious pattern in sensitive file",
                "diff": "--- a/api.py\n+++ b/api.py\n@@ -1,3 +1,4 @@\n import os\n+import subprocess\n import json\n-print('hello')\n+subprocess.run(['rm', '-rf', '/'])"
            },
            "created_at": now - timedelta(minutes=15)
        },
        {
            "run_id": "run_456",
            "agent_id": "marketing",
            "risk_level": "medium",
            "payload": {
                "agent_id": "marketing",
                "risk_level": "medium",
                "reason": "Send campaign to 500 leads",
                "campaign_id": 10,
                "message": "Hello, we found a vulnerability in your repo..."
            },
            "created_at": now - timedelta(hours=2)
        },
        {
            "run_id": "run_789",
            "agent_id": "research",
            "risk_level": "low",
            "payload": {
                "agent_id": "research",
                "risk_level": "low",
                "reason": "Query external API for more info",
                "url": "https://api.example.com/data"
            },
            "created_at": now - timedelta(hours=25) # Should be expired
        }
    ]

    for a in approvals:
        cursor.execute(
            "INSERT INTO agent_events (tenant_id, event_type, payload, created_at) VALUES (?, ?, ?, ?)",
            (a["run_id"], "approval_required", json.dumps(a["payload"]), a["created_at"].isoformat())
        )
        approval_id = cursor.lastrowid
        
        # Add an audit event for one of them
        if a["run_id"] == "run_456":
             cursor.execute(
                "INSERT INTO audit_events (entity_type, entity_id, action, actor, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                ("approval", str(approval_id), "approved", "operator", json.dumps({"note": "Looks good, proceed."}), (now - timedelta(hours=1)).isoformat())
            )

    conn.commit()
    conn.close()
    print("Seeded approvals.")

if __name__ == "__main__":
    seed()
