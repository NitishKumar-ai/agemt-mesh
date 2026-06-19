# @agentmesh/gcs-storage

Google Cloud Storage implementation of `ExternalPayloadStorage` and `FileStorage` for AgentMesh.

## Features

- **`GcsExternalPayloadStorage`** — stores/retrieves JSON payloads as GCS objects with signed URL support
- **`GcsFileStorage`** — user-facing binary file storage with presigned upload/download URLs, compose-based multipart

## Configuration

```typescript
import { Storage } from '@google-cloud/storage';
import { GcsExternalPayloadStorage, GcsFileStorage } from '@agentmesh/gcs-storage';

const storage = new Storage({ keyFilename: '/path/to/key.json' });

const payloadStorage = new GcsExternalPayloadStorage({
  bucketName: 'my-agentmesh-payloads',
}, storage);

const fileStorage = new GcsFileStorage({
  bucketName: 'my-agentmesh-files',
  signedUrlExpirationSeconds: 3600,
}, storage);
```

## Expected CQL Schema

Tables are expected to exist externally. See source for schema definitions.
