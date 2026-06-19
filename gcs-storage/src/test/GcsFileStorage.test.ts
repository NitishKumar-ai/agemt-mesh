import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GcsFileStorage } from '../GcsFileStorage.js';

function createMockStorage() {
  const mockFile = {
    save: vi.fn().mockResolvedValue(undefined),
    download: vi.fn().mockResolvedValue([Buffer.from('content')]),
    delete: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue([true]),
    getSignedUrl: vi
      .fn()
      .mockResolvedValue(['https://storage.googleapis.com/signed-url']),
  };
  return {
    bucket: vi.fn().mockReturnValue({
      name: 'test-bucket',
      file: vi.fn().mockReturnValue(mockFile),
      combine: vi.fn().mockResolvedValue([{}]),
      getFiles: vi.fn().mockResolvedValue([[]]),
    }),
  };
}

describe('GcsFileStorage', () => {
  let storage: GcsFileStorage;
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    mockStorage = createMockStorage();
    storage = new GcsFileStorage(
      { bucketName: 'test-bucket' },
      mockStorage as any,
    );
  });

  it('returns type gcs', () => {
    expect(storage.getType()).toBe('gcs');
  });

  it('creates a file record', async () => {
    const meta = await storage.createFile(
      'wf1',
      'report.pdf',
      'application/pdf',
    );

    expect(meta.fileId).toBeDefined();
    expect(meta.workflowId).toBe('wf1');
    expect(meta.fileName).toBe('report.pdf');
    expect(meta.contentType).toBe('application/pdf');
    expect(meta.status).toBe('pending');
    expect(meta.size).toBe(0);
  });

  it('generates an upload URL', async () => {
    await storage.createFile('wf1', 'doc.txt', 'text/plain');
    const fileId = (await storage.createFile('wf2', 'doc.txt', 'text/plain'))
      .fileId;

    const resp = await storage.getUploadUrl(fileId);

    expect(resp.uploadUrl).toBe(
      'https://storage.googleapis.com/signed-url',
    );
    expect(resp.fileId).toBe(fileId);
    expect(resp.signedHeaders['Content-Type']).toBe('text/plain');
  });

  it('generates a download URL', async () => {
    const { fileId } = await storage.createFile(
      'wf1',
      'photo.jpg',
      'image/jpeg',
    );

    const resp = await storage.getDownloadUrl(fileId);

    expect(resp.downloadUrl).toBe(
      'https://storage.googleapis.com/signed-url',
    );
    expect(resp.fileId).toBe(fileId);
  });

  it('completes an upload', async () => {
    const { fileId } = await storage.createFile(
      'wf1',
      'data.csv',
      'text/csv',
    );

    const meta = await storage.completeUpload(fileId);

    expect(meta.status).toBe('completed');
  });

  it('returns null for non-existent file metadata', async () => {
    const meta = await storage.getFileMetadata('non-existent-id');

    expect(meta).toBeNull();
  });

  it('throws when getting upload URL for non-existent file', async () => {
    await expect(storage.getUploadUrl('no-such-file')).rejects.toThrow(
      'not found',
    );
  });

  it('deletes a file', async () => {
    const { fileId } = await storage.createFile(
      'wf1',
      'delete-me.txt',
      'text/plain',
    );

    const deleted = await storage.deleteFile(fileId);

    expect(deleted).toBe(true);
    const meta = await storage.getFileMetadata(fileId);
    expect(meta).toBeNull();
  });

  it('returns false when deleting non-existent file', async () => {
    const deleted = await storage.deleteFile('no-such-file');

    expect(deleted).toBe(false);
  });

  it('handles multipart upload cycle', async () => {
    const { fileId } = await storage.createFile(
      'wf1',
      'large.zip',
      'application/zip',
    );

    // Initiate multipart
    const { uploadId } = await storage.initiateMultipartUpload(fileId, 3);
    expect(uploadId).toBeDefined();

    // Get part URLs
    const part1 = await storage.getPartUploadUrl(uploadId, fileId, 1);
    expect(part1.partUploadUrl).toBe(
      'https://storage.googleapis.com/signed-url',
    );
    expect(part1.partNumber).toBe(1);

    const part2 = await storage.getPartUploadUrl(uploadId, fileId, 2);
    expect(part2.partNumber).toBe(2);

    const part3 = await storage.getPartUploadUrl(uploadId, fileId, 3);
    expect(part3.partNumber).toBe(3);

    // Complete multipart
    const meta = await storage.completeMultipartUpload(uploadId, fileId, [
      { partNumber: 1, etag: '"etag1"' },
      { partNumber: 2, etag: '"etag2"' },
      { partNumber: 3, etag: '"etag3"' },
    ]);

    expect(meta.status).toBe('completed');

    // Verify GCS combine was called
    const bucket = mockStorage.bucket('test-bucket');
    expect(bucket.combine).toHaveBeenCalledOnce();
  });
});
