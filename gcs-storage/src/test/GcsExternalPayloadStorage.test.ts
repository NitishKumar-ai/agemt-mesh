import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GcsExternalPayloadStorage } from '../GcsExternalPayloadStorage.js';

function createMockStorage() {
  const mockFile = {
    save: vi.fn().mockResolvedValue(undefined),
    download: vi.fn().mockResolvedValue([Buffer.from('{"key":"value"}')]),
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

describe('GcsExternalPayloadStorage', () => {
  let storage: GcsExternalPayloadStorage;
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    mockStorage = createMockStorage();
    storage = new GcsExternalPayloadStorage(
      { bucketName: 'test-bucket' },
      mockStorage as any,
    );
  });

  it('stores a payload at the given path', async () => {
    const result = await storage.store(
      'workflow/input/abc.json',
      '{"data":"test"}',
    );

    expect(result).toBe('gs://test-bucket/workflow/input/abc.json');

    const bucket = mockStorage.bucket('test-bucket');
    const file = bucket.file('workflow/input/abc.json');
    expect(file.save).toHaveBeenCalledWith('{"data":"test"}', {
      contentType: 'application/json',
      resumable: false,
    });
  });

  it('retrieves a stored payload', async () => {
    const result = await storage.get('workflow/input/abc.json');

    expect(result).toBe('{"key":"value"}');
  });

  it('returns null for a non-existent path', async () => {
    const bucket = mockStorage.bucket('test-bucket');
    bucket.file('nonexistent').exists.mockResolvedValue([false]);

    const storage2 = new GcsExternalPayloadStorage(
      { bucketName: 'test-bucket' },
      mockStorage as any,
    );
    const result = await storage2.get('nonexistent');

    expect(result).toBeNull();
  });

  it('removes a stored payload', async () => {
    const result = await storage.remove('workflow/input/abc.json');

    expect(result).toBe(true);

    const bucket = mockStorage.bucket('test-bucket');
    const file = bucket.file('workflow/input/abc.json');
    expect(file.delete).toHaveBeenCalledOnce();
  });

  it('returns false when removing a non-existent payload', async () => {
    const bucket = mockStorage.bucket('test-bucket');
    bucket.file('nonexistent').exists.mockResolvedValue([false]);

    const result = await storage.remove('nonexistent');

    expect(result).toBe(false);
  });

  it('generates a signed URL', async () => {
    const url = await storage.getSignedUrl(
      'workflow/input/abc.json',
      600,
    );

    expect(url).toBe('https://storage.googleapis.com/signed-url');

    const bucket = mockStorage.bucket('test-bucket');
    const file = bucket.file('workflow/input/abc.json');
    expect(file.getSignedUrl).toHaveBeenCalledWith({
      action: 'read',
      expires: expect.any(Number),
    });
  });
});
