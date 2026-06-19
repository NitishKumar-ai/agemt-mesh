/**
 * File metadata returned by FileStorage operations.
 */
export interface FileMetadata {
  fileId: string;
  workflowId: string;
  fileName: string;
  contentType: string;
  size: number;
  uploadedAt: number;
  status: 'pending' | 'uploaded' | 'completed';
}

/**
 * Response from getUploadUrl.
 */
export interface UploadUrlResponse {
  uploadUrl: string;
  fileId: string;
  /** Headers the client must include with the upload request (e.g. Content-Type). */
  signedHeaders: Record<string, string>;
}

/**
 * Response from getDownloadUrl.
 */
export interface DownloadUrlResponse {
  downloadUrl: string;
  fileId: string;
}

/**
 * Response from initiateMultipartUpload.
 */
export interface MultipartUploadResponse {
  uploadId: string;
  fileId: string;
}

/**
 * Response from getPartUploadUrl.
 */
export interface PartUploadUrlResponse {
  partUploadUrl: string;
  partNumber: number;
}

/**
 * User-facing binary file management with presigned URLs.
 *
 * Storage layout: agentmesh/<workflowId>/<fileId>
 *
 * Supports single-shot uploads via presigned URLs and multipart uploads
 * for large files using cloud-provider-specific mechanisms (S3 Multipart,
 * GCS Compose, Azure Block Blobs).
 */
export interface FileStorage {
  /** Returns a discriminator string (e.g. 'gcs', 's3', 'azure-blob'). */
  getType(): string;

  /** Register a new file record. Idempotent for the same fileId. */
  createFile(
    workflowId: string,
    fileName: string,
    contentType: string,
  ): Promise<FileMetadata>;

  /** Get a presigned URL for uploading the file content. */
  getUploadUrl(fileId: string): Promise<UploadUrlResponse>;

  /** Get a presigned URL for downloading the file content. */
  getDownloadUrl(fileId: string): Promise<DownloadUrlResponse>;

  /** Mark the file upload as complete. Triggers any backend finalization. */
  completeUpload(fileId: string): Promise<FileMetadata>;

  /** Initialize a multipart upload for large files. */
  initiateMultipartUpload(
    fileId: string,
    partCount: number,
  ): Promise<MultipartUploadResponse>;

  /** Get a presigned URL for uploading a specific part. */
  getPartUploadUrl(
    uploadId: string,
    fileId: string,
    partNumber: number,
  ): Promise<PartUploadUrlResponse>;

  /** Complete a multipart upload by assembling all parts. */
  completeMultipartUpload(
    uploadId: string,
    fileId: string,
    parts: Array<{ partNumber: number; etag: string }>,
  ): Promise<FileMetadata>;

  /** Retrieve full metadata for a stored file. Returns null if not found. */
  getFileMetadata(fileId: string): Promise<FileMetadata | null>;

  /** Delete a file and its metadata. Returns true if deleted. */
  deleteFile(fileId: string): Promise<boolean>;
}
