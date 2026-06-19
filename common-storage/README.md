# @agentmesh/common-storage

Shared interfaces and types for storage backends in AgentMesh.

## Interfaces

- **`ExternalPayloadStorage`** — store/get/remove/getSignedUrl for transparent JSON payload offloading
- **`FileStorage`** — user-facing binary file management with presigned URLs and multipart support

## Helpers

- **`PayloadPath`** — constant path helpers (`workflowInput`, `workflowOutput`, `taskInput`, `taskOutput`, `fileStorage`)

## Usage

```typescript
import type { ExternalPayloadStorage, FileStorage } from '@agentmesh/common-storage';
```

See implementation packages:
- [`@agentmesh/gcs-storage`](../gcs-storage)
- [`@agentmesh/local-file-storage`](../local-file-storage)
- [`@agentmesh/postgres-external-storage`](../postgres-external-storage)
