CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS agentmesh_vector_index_1536 (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  permission_hash TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding_provider TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS am_vec_1536_tenant_type
  ON agentmesh_vector_index_1536 (tenant_id, resource_type);

CREATE INDEX IF NOT EXISTS am_vec_1536_permission
  ON agentmesh_vector_index_1536 (tenant_id, permission_hash);

CREATE INDEX IF NOT EXISTS am_vec_1536_embedding_hnsw
  ON agentmesh_vector_index_1536
  USING hnsw (embedding vector_cosine_ops);
