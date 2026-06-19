import { Storage, Bucket, File } from '@google-cloud/storage';
import { randomUUID } from 'node:crypto';
import type {
  FileStorage,
  FileMetadata,
  UploadUrlResponse,
  DownloadUrlResponse,
  MultipartUploadResponse,
  PartUploadUrlResponse,
} from '@agentmesh/common-storage';

export interface GcsFileStorageOptions {
  bucketName: string;
  keyFilename?: string;
  projectId?: string;
  signedUrlExpirationSeconds?: number;
}

interface FileRecord {
  fileId: string;
  workflowId: string;
  fileName: string;
  contentType: string;
  size: number;
  uploadedAt: number;
  status: 'pending' | 'uploaded' | 'completed';
}

/**
 * GCS implementation of FileStorage.
 *
 * Uses composable GCS objects for multipart support: each part is uploaded
 * as a separate object (<fileId>.partN), then composed into the final object
 * via GCS compose. Part objects are cleaned up after composition.
 *
 * Metadata is stored in-memory (v1). Replace with a database-backed store
 * for production use.
 */
export class GcsFileStorage implements FileStorage {
  private readonly bucket: Bucket;
  private readonly defaultExpiration: number;
  private readonly metadataStore = new Map<string, FileRecord>();

  constructor(options: GcsFileStorageOptions, storage?: Storage) {
    const st =
      storage ??
      new Storage({
        keyFilename: options.keyFilename,
        projectId: options.projectId,
      });
    this.bucket = st.bucket(options.bucketName);
    this.defaultExpiration = options.signedUrlExpirationSeconds ?? 3600;
  }

  getType(): string {
    return 'gcs';
  }

  async createFile(
    workflowId: string,
    fileName: string,
    contentType: string,
  ): Promise<FileMetadata> {
    const fileId = randomUUID();
    const now = Date.now();
    const record: FileRecord = {
      fileId,
      workflowId,
      fileName,
      contentType,
      size: 0,
      uploadedAt: now,
      status: 'pending',
    };
    this.metadataStore.set(fileId, record);
    return { ...record };
  }

  async getUploadUrl(fileId: string): Promise<UploadUrlResponse> {
    const record = this.metadataStore.get(fileId);
    if (!record) throw new Error(`File ${fileId} not found`);

    const objectPath = this.objectPath(record.workflowId, fileId);
    const file: File = this.bucket.file(objectPath);
    const expiresMs = Date.now() + this.defaultExpiration * 1000;
    const [url] = await file.getSignedUrl({
      action: 'write',
      expires: expiresMs,
      contentType: record.contentType,
    });

    return {
      uploadUrl: url,
      fileId,
      signedHeaders: { 'Content-Type': record.contentType },
    };
  }

  async getDownloadUrl(fileId: string): Promise<DownloadUrlResponse> {
    const record = this.metadataStore.get(fileId);
    if (!record) throw new Error(`File ${fileId} not found`);

    const objectPath = this.objectPath(record.workflowId, fileId);
    const file: File = this.bucket.file(objectPath);
    const expiresMs = Date.now() + this.defaultExpiration * 1000;
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: expiresMs,
    });

    return { downloadUrl: url, fileId };
  }

  async completeUpload(fileId: string): Promise<FileMetadata> {
    const record = this.metadataStore.get(fileId);
    if (!record) throw new Error(`File ${fileId} not found`);
    record.status = 'completed';
    return { ...record };
  }

  async initiateMultipartUpload(
    fileId: string,
    _partCount: number,
  ): Promise<MultipartUploadResponse> {
    const record = this.metadataStore.get(fileId);
    if (!record) throw new Error(`File ${fileId} not found`);

    const uploadId = randomUUID();
    return { uploadId, fileId };
  }

  async getPartUploadUrl(
    uploadId: string,
    fileId: string,
    partNumber: number,
  ): Promise<PartUploadUrlResponse> {
    const record = this.metadataStore.get(fileId);
    if (!record) throw new Error(`File ${fileId} not found`);

    const objectPath = `${this.objectPath(record.workflowId, fileId)}.part${partNumber}`;
    const file: File = this.bucket.file(objectPath);
    const expiresMs = Date.now() + this.defaultExpiration * 1000;
    const [url] = await file.getSignedUrl({
      action: 'write',
      expires: expiresMs,
      contentType: 'application/octet-stream',
    });

    return { partUploadUrl: url, partNumber };
  }

  async completeMultipartUpload(
    _uploadId: string,
    fileId: string,
    parts: Array<{ partNumber: number; etag: string }>,
  ): Promise<FileMetadata> {
    const record = this.metadataStore.get(fileId);
    if (!record) throw new Error(`File ${fileId} not found`);

    const finalPath = this.objectPath(record.workflowId, fileId);

    // Compose all part objects into the final object
    const sources = parts.map((p) =>
      this.bucket.file(
        `${this.objectPath(record.workflowId, fileId)}.part${p.partNumber}`,
      ),
    );
    await this.bucket.combine(sources, finalPath);

    // Clean up part objects (best-effort)
    for (const p of parts) {
      const partFile: File = this.bucket.file(
        `${this.objectPath(record.workflowId, fileId)}.part${p.partNumber}`,
      );
      await partFile.delete().catch(() => {});
    }

    record.status = 'completed';
    return { ...record };
  }

  async getFileMetadata(fileId: string): Promise<FileMetadata | null> {
    const record = this.metadataStore.get(fileId);
    return record ? { ...record } : null;
  }

  async deleteFile(fileId: string): Promise<boolean> {
    const record = this.metadataStore.get(fileId);
    if (!record) return false;

    const objectPath = this.objectPath(record.workflowId, fileId);
    await this.bucket
      .file(objectPath)
      .delete()
      .catch(() => {});
    this.metadataStore.delete(fileId);
    return true;
  }

  private objectPath(workflowId: string, fileId: string): string {
    return `agentmesh/${workflowId}/${fileId}`;
  }
}
