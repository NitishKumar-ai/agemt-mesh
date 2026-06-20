-- Create tenants table
CREATE TABLE IF NOT EXISTS tenants (
  tenant_id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  region VARCHAR(50),
  policy_profile JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP
);

-- Create episodes table
CREATE TABLE IF NOT EXISTS episodes (
  episode_id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  source_system VARCHAR(50) NOT NULL,
  source_id VARCHAR(255) NOT NULL,
  source_version VARCHAR(50) NOT NULL,
  raw_pointer TEXT NOT NULL,
  parsed_hash VARCHAR(64),
  parsed_content JSONB,
  author VARCHAR(255),
  created_at TIMESTAMP NOT NULL,
  ingested_at TIMESTAMP DEFAULT NOW()
);

-- Create entities table
CREATE TABLE IF NOT EXISTS entities (
  entity_id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  aliases JSONB DEFAULT '[]',
  source_refs JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create facts table
CREATE TABLE IF NOT EXISTS facts (
  fact_id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  subject VARCHAR(255) NOT NULL,
  predicate VARCHAR(100) NOT NULL,
  object TEXT NOT NULL,
  confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'disputed', 'deleted')),
  observed_at TIMESTAMP NOT NULL,
  ingested_at TIMESTAMP DEFAULT NOW(),
  valid_from TIMESTAMP NOT NULL,
  valid_to TIMESTAMP,
  superseded_by UUID REFERENCES facts(fact_id) ON DELETE SET NULL,
  episode_ids UUID[] NOT NULL,
  extractor_version VARCHAR(50)
);

-- Create ingestion_jobs table
CREATE TABLE IF NOT EXISTS ingestion_jobs (
  job_id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  source_system VARCHAR(50) NOT NULL,
  source_id VARCHAR(255) NOT NULL,
  source_version VARCHAR(50) NOT NULL,
  event_time TIMESTAMP NOT NULL,
  arrival_time TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  processed_at TIMESTAMP
);

-- Create search_index table with pgvector
CREATE TABLE IF NOT EXISTS search_index (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  fact_id UUID REFERENCES facts(fact_id) ON DELETE SET NULL,
  episode_id UUID REFERENCES episodes(episode_id) ON DELETE SET NULL,
  embedding vector(1536),
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_episodes_tenant_id ON episodes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_episodes_source_system ON episodes(source_system);
CREATE INDEX IF NOT EXISTS idx_entities_tenant_id ON entities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_facts_tenant_id ON facts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_facts_subject ON facts(subject);
CREATE INDEX IF NOT EXISTS idx_facts_predicate ON facts(predicate);
CREATE INDEX IF NOT EXISTS idx_facts_status ON facts(status);
CREATE INDEX IF NOT EXISTS idx_facts_valid_from ON facts(valid_from);
CREATE INDEX IF NOT EXISTS idx_facts_valid_to ON facts(valid_to);
CREATE INDEX IF NOT EXISTS idx_search_index_tenant_id ON search_index(tenant_id);
CREATE INDEX IF NOT EXISTS idx_search_index_fact_id ON search_index(fact_id);
CREATE INDEX IF NOT EXISTS idx_search_index_episode_id ON search_index(episode_id);
CREATE INDEX IF NOT EXISTS idx_search_index_embedding ON search_index USING hnsw (embedding vector_cosine_ops);

-- Create full-text search index
CREATE INDEX IF NOT EXISTS idx_facts_fulltext_search ON facts USING gin(to_tsvector('english', subject || ' ' || predicate || ' ' || object));

-- Add comments for documentation
COMMENT ON TABLE tenants IS 'Tenant model with region and policy profiles';
COMMENT ON TABLE episodes IS 'Raw source captures - immutable or append-only';
COMMENT ON TABLE entities IS 'Canonical entities extracted from episodes';
COMMENT ON TABLE facts IS 'Atomic assertions extracted or derived from episodes';
COMMENT ON TABLE ingestion_jobs IS 'Ingestion job tracking with retry logic';
COMMENT ON TABLE search_index IS 'Vector embeddings for semantic search';
COMMENT ON COLUMN facts.valid_from IS 'When this fact becomes valid';
COMMENT ON COLUMN facts.valid_to IS 'When this fact becomes invalid (NULL if still valid)';
COMMENT ON COLUMN facts.superseded_by IS 'Fact that supersedes this fact';
COMMENT ON COLUMN facts.status IS 'Current state of the fact';