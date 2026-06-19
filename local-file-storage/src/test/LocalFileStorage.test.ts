import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalFileStorage } from '../LocalFileStorage.js';

describe('LocalFileStorage', () => {
  let root: string;
  let storage: LocalFileStorage;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'local-files-'));
    storage = new LocalFileStorage({ storageDir: root });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns type local', () => {
    expect(storage.getType()).toBe('local');
  });

  it('creates a file record', async () => {
    const meta = await storage.createFile('wf1', 'doc.pdf', 'application/pdf');
    expect(meta.fileId).toBeDefined();
    expect(meta.workflowId).toBe('wf1');
    expect(meta.status).toBe('pending');
  });

  it('gets upload and download URLs', async () => {
    const { fileId } = await storage.createFile('wf1', 'file.txt', 'text/plain');

    const up = await storage.getUploadUrl(fileId);
    expect(up.uploadUrl).toContain('file://');
    expect(up.signedHeaders['Content-Type']).toBe('text/plain');

    const down = await storage.getDownloadUrl(fileId);
    expect(down.downloadUrl).toContain('file://');
  });

  it('throws for non-existent file', async () => {
    await expect(storage.getUploadUrl('ghost')).rejects.toThrow('not found');
  });

  it('completes upload', async () => {
    const { fileId } = await storage.createFile('wf1', 'data.csv', 'text/csv');
    const meta = await storage.completeUpload(fileId);
    expect(meta.status).toBe('completed');
  });

  it('deletes a file', async () => {
    const { fileId } = await storage.createFile('wf2', 'del.txt', 'text/plain');
    const deleted = await storage.deleteFile(fileId);
    expect(deleted).toBe(true);
    expect(await storage.getFileMetadata(fileId)).toBeNull();
  });

  it('returns false deleting non-existent file', async () => {
    expect(await storage.deleteFile('ghost')).toBe(false);
  });

  it('multipart upload writes combined file', async () => {
    const { fileId } = await storage.createFile('wf1', 'combined.bin', 'application/octet-stream');
    const { uploadId } = await storage.initiateMultipartUpload(fileId, 2);

    const p1 = await storage.getPartUploadUrl(uploadId, fileId, 1);
    const p2 = await storage.getPartUploadUrl(uploadId, fileId, 2);
    expect(p1.partNumber).toBe(1);
    expect(p2.partNumber).toBe(2);

    const { writeFileSync } = await import('node:fs');
    writeFileSync(p1.partUploadUrl.replace('file://', ''), 'hello ');
    writeFileSync(p2.partUploadUrl.replace('file://', ''), 'world');

    const meta = await storage.completeMultipartUpload(uploadId, fileId, [
      { partNumber: 1, etag: 'a' },
      { partNumber: 2, etag: 'b' },
    ]);

    expect(meta.status).toBe('completed');
    const finalPath = join(root, 'agentmesh', 'wf1', fileId);
    expect(readFileSync(finalPath, 'utf-8')).toBe('hello world');
  });
});
