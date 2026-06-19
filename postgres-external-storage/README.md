# @agentmesh/postgres-external-storage

PostgreSQL implementation of `ExternalPayloadStorage` for AgentMesh.

Stores JSON payloads as bytea rows with automatic cleanup via a trigger.

## Usage

```typescript
import { PostgresExternalPayloadStorage } from '@agentmesh/postgres-external-storage';

const storage = new PostgresExternalPayloadStorage({
  connectionString: 'postgres://localhost:5432/agentmesh',
  tableName: 'external_payload',
});
```

## Schema

```sql
CREATE TABLE external_payload (
    id   TEXT PRIMARY KEY,
    data BYTEA NOT NULL,
    created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

See `src/main/resources/db/migration_external_postgres/R__initial_schema.sql` for the full schema including the cleanup trigger.
