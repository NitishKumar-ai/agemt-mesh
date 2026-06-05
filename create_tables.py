import sqlite3
from github_integration import ensure_github_tables
conn = sqlite3.connect('agent_mesh.sqlite')
conn.execute("CREATE TABLE IF NOT EXISTS agent_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT, agent_id TEXT, step TEXT, status TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
conn.execute("CREATE TABLE IF NOT EXISTS agent_events (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT, payload TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
conn.execute("CREATE TABLE IF NOT EXISTS dlq_events (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT, agent_id TEXT, error TEXT, payload TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")

# Jules tables
conn.execute("""
CREATE TABLE IF NOT EXISTS suggested_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    marker TEXT NOT NULL,
    comment TEXT NOT NULL,
    context_snippet TEXT,
    rationale TEXT,
    confidence INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    workflow_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
""")
conn.execute("""
CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    interval TEXT NOT NULL,
    next_run_at TIMESTAMP NOT NULL,
    last_run_at TIMESTAMP,
    last_status TEXT,
    enabled INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
""")
conn.execute("CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run ON scheduled_tasks(next_run_at, enabled)")
conn.execute("""
CREATE TABLE IF NOT EXISTS webhook_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    event_type TEXT NOT NULL,
    branch TEXT,
    payload TEXT,
    workflow_id TEXT,
    status TEXT DEFAULT 'received',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
""")
conn.execute("""
CREATE TABLE IF NOT EXISTS security_findings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_agent TEXT NOT NULL DEFAULT 'CommitGuardAgent',
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    evidence TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium',
    repository TEXT,
    status TEXT NOT NULL DEFAULT 'review_required',
    verified_by TEXT,
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
""")
conn.execute("""
CREATE TABLE IF NOT EXISTS marketing_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_finding_id INTEGER,
    name TEXT NOT NULL,
    audience TEXT NOT NULL,
    finding_summary TEXT NOT NULL,
    value_proposition TEXT,
    channel TEXT DEFAULT 'email',
    status TEXT DEFAULT 'draft',
    subject TEXT,
    body TEXT,
    approval_note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
""")
conn.execute("""
CREATE TABLE IF NOT EXISTS marketing_audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT 'system',
    payload TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
""")
marketing_columns = {
    row[1] for row in conn.execute("PRAGMA table_info(marketing_campaigns)").fetchall()
}
if "source_finding_id" not in marketing_columns:
    conn.execute("ALTER TABLE marketing_campaigns ADD COLUMN source_finding_id INTEGER")
ensure_github_tables(conn)
conn.commit()
conn.close()
