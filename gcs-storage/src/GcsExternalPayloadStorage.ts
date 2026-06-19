import { Storage, Bucket, File } from '@google-cloud/storage';
import type { ExternalPayloadStorage } from '@agentmesh/common-storage';

export interface GcsExternalPayloadStorageOptions {
  bucketName: string;
  keyFilename?: string;
  projectId?: string;
  signedUrlExpirationSeconds?: number;
}

/**
 * GCS implementation of ExternalPayloadStorage.
 *
 * Stores and retrieves JSON-stringified payloads as GCS objects.
 * Payloads are stored as application/json with no resumable upload.
 */
export class GcsExternalPayloadStorage implements ExternalPayloadStorage {
  private readonly bucket: Bucket;
  private readonly defaultExpiration: number;

  constructor(
    options: GcsExternalPayloadStorageOptions,
    storage?: Storage,
  ) {
    const st =
      storage ??
      new Storage({
        keyFilename: options.keyFilename,
        projectId: options.projectId,
      });
    this.bucket = st.bucket(options.bucketName);
    this.defaultExpiration = options.signedUrlExpirationSeconds ?? 300;
  }

  async store(path: string, payload: string): Promise<string> {
    const file: File = this.bucket.file(path);
    await file.save(payload, {
      contentType: 'application/json',
      resumable: false,
    });
    return `gs://${this.bucket.name}/${path}`;
  }

  async get(path: string): Promise<string | null> {
    const file: File = this.bucket.file(path);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [content] = await file.download();
    return content.toString('utf-8');
  }

  async remove(path: string): Promise<boolean> {
    const file: File = this.bucket.file(path);
    const [exists] = await file.exists();
    if (!exists) return false;
    await file.delete();
    return true;
  }

  async getSignedUrl(
    path: string,
    expirationInSeconds?: number,
  ): Promise<string> {
    const file: File = this.bucket.file(path);
    const expiresIn = expirationInSeconds ?? this.defaultExpiration;
    const expiresMs = Date.now() + expiresIn * 1000;
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: expiresMs,
    });
    return url;
  }
}
