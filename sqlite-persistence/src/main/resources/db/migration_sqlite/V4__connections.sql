CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    connector_type TEXT NOT NULL,
    status TEXT NOT NULL,
    config TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_connections_provider_id ON connections(provider_id);
