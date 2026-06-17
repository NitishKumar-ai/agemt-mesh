-- Extra schema for Agent Mesh on top of Conductor's Postgres
-- Conductor creates its own tables automatically via Flyway migrations.
-- This file adds Agent Mesh-specific tables that coexist in the same DB.

CREATE TABLE IF NOT EXISTS agent_mesh_runs (
    run_id          TEXT PRIMARY KEY,
    agent_id        TEXT NOT NULL,
    tenant_id       TEXT NOT NULL DEFAULT 'default',
    goal            TEXT,
    conductor_wf_id TEXT,          -- Conductor workflow execution ID
    status          TEXT NOT NULL DEFAULT 'pending',
    cost_usd        NUMERIC(10,6) DEFAULT 0,
    tokens_used     INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_mesh_runs_agent ON agent_mesh_runs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_mesh_runs_tenant ON agent_mesh_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_mesh_runs_conductor_wf ON agent_mesh_runs(conductor_wf_id);

CREATE TABLE IF NOT EXISTS agent_mesh_events (
    id              BIGSERIAL PRIMARY KEY,
    run_id          TEXT NOT NULL,
    agent_id        TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    payload         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_mesh_events_run ON agent_mesh_events(run_id);
