import { mkdir, writeFile, readFile, unlink, access, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  FileStorage,
  FileMetadata,
  UploadUrlResponse,
  DownloadUrlResponse,
  MultipartUploadResponse,
  PartUploadUrlResponse,
} from '@agentmesh/common-storage';

export interface LocalFileStorageOptions {
  /** Root directory for file storage (default: ./data/files) */
  storageDir?: string;
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
 * Local filesystem implementation of FileStorage.
 *
 * Stores files under a configurable root directory organised by workflow.
 * Presigned URLs are emulated as file:// paths — works for local development
 * but not suitable for distributed deployments.
 */
export class LocalFileStorage implements FileStorage {
  private readonly root: string;
  private readonly metadataStore = new Map<string, FileRecord>();

  constructor(options: LocalFileStorageOptions = {}) {
    this.root = options.storageDir ?? join(process.cwd(), 'data', 'files');
  }

  getType(): string {
    return 'local';
  }

  async createFile(
    workflowId: string,
    fileName: string,
    contentType: string,
  ): Promise<FileMetadata> {
    const fileId = randomUUID();
    const record: FileRecord = {
      fileId,
      workflowId,
      fileName,
      contentType,
      size: 0,
      uploadedAt: Date.now(),
      status: 'pending',
    };
    this.metadataStore.set(fileId, record);
    return { ...record };
  }

  async getUploadUrl(fileId: string): Promise<UploadUrlResponse> {
    const record = this.metadataStore.get(fileId);
    if (!record) throw new Error(`File ${fileId} not found`);

    const objectPath = this.objectPath(record.workflowId, fileId);
    const fullPath = join(this.root, objectPath);
    await mkdir(dirname(fullPath), { recursive: true });

    return {
      uploadUrl: `file://${fullPath}`,
      fileId,
      signedHeaders: { 'Content-Type': record.contentType },
    };
  }

  async getDownloadUrl(fileId: string): Promise<DownloadUrlResponse> {
    const record = this.metadataStore.get(fileId);
    if (!record) throw new Error(`File ${fileId} not found`);

    const objectPath = this.objectPath(record.workflowId, fileId);
    const fullPath = join(this.root, objectPath);

    return { downloadUrl: `file://${fullPath}`, fileId };
  }

  async completeUpload(fileId: string): Promise<FileMetadata> {
    const record = this.metadataStore.get(fileId);
    if (!record) throw new Error(`File ${fileId} not found`);

    const fullPath = join(this.root, this.objectPath(record.workflowId, fileId));
    try {
      const s = await stat(fullPath);
      record.size = s.size;
    } catch {
      // file may not exist yet — size stays 0
    }

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
    _uploadId: string,
    fileId: string,
    partNumber: number,
  ): Promise<PartUploadUrlResponse> {
    const record = this.metadataStore.get(fileId);
    if (!record) throw new Error(`File ${fileId} not found`);

    const objectPath = `${this.objectPath(record.workflowId, fileId)}.part${partNumber}`;
    const fullPath = join(this.root, objectPath);
    await mkdir(dirname(fullPath), { recursive: true });

    return { partUploadUrl: `file://${fullPath}`, partNumber };
  }

  async completeMultipartUpload(
    _uploadId: string,
    fileId: string,
    parts: Array<{ partNumber: number; etag: string }>,
  ): Promise<FileMetadata> {
    const record = this.metadataStore.get(fileId);
    if (!record) throw new Error(`File ${fileId} not found`);

    // Concatenate part files into the final file
    const finalPath = join(this.root, this.objectPath(record.workflowId, fileId));
    const buffers: Buffer[] = [];

    for (const p of parts) {
      const partPath = join(
        this.root,
        `${this.objectPath(record.workflowId, fileId)}.part${p.partNumber}`,
      );
      try {
        const data = await readFile(partPath);
        buffers.push(data);
        await unlink(partPath).catch(() => {});
      } catch {
        // part file may not exist yet
      }
    }

    await mkdir(dirname(finalPath), { recursive: true });
    await writeFile(finalPath, Buffer.concat(buffers));

    const s = await stat(finalPath);
    record.size = s.size;
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

    const fullPath = join(this.root, this.objectPath(record.workflowId, fileId));
    await unlink(fullPath).catch(() => {});
    this.metadataStore.delete(fileId);
    return true;
  }

  private objectPath(workflowId: string, fileId: string): string {
    return `agentmesh/${workflowId}/${fileId}`;
  }
}
