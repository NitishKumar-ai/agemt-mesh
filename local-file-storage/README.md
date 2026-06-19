# @agentmesh/local-file-storage

Local filesystem implementation of `ExternalPayloadStorage` and `FileStorage`.

Intended for development and single-node deployments where cloud storage is unavailable.

## Features

- Files stored under a configurable root directory
- Multipart support via part files concatenated into the final file
- `file://` URIs instead of presigned URLs

## Usage

```typescript
import { LocalExternalPayloadStorage, LocalFileStorage } from '@agentmesh/local-file-storage';

const payloadStorage = new LocalExternalPayloadStorage({
  storageDir: './data/external-payloads',
});

const fileStorage = new LocalFileStorage({
  storageDir: './data/files',
});
```
