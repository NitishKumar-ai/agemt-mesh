import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalExternalPayloadStorage } from '../LocalExternalPayloadStorage.js';

describe('LocalExternalPayloadStorage', () => {
  let root: string;
  let storage: LocalExternalPayloadStorage;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'local-ext-'));
    storage = new LocalExternalPayloadStorage({ storageDir: root });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('stores and retrieves a payload', async () => {
    const uri = await storage.store('workflow/input/test.json', '{"data":42}');
    expect(uri).toContain('file://');
    expect(existsSync(join(root, 'workflow/input/test.json'))).toBe(true);

    const result = await storage.get('workflow/input/test.json');
    expect(result).toBe('{"data":42}');
  });

  it('returns null for missing payload', async () => {
    const result = await storage.get('nonexistent.json');
    expect(result).toBeNull();
  });

  it('removes a payload', async () => {
    await storage.store('tasks/t1.json', 'x');
    const removed = await storage.remove('tasks/t1.json');
    expect(removed).toBe(true);
    expect(existsSync(join(root, 'tasks/t1.json'))).toBe(false);
  });

  it('returns false when removing non-existent file', async () => {
    const removed = await storage.remove('ghost.json');
    expect(removed).toBe(false);
  });

  it('throws on signed URL request', async () => {
    await expect(storage.getSignedUrl('some/path', 300)).rejects.toThrow(
      'Signed URLs are not supported',
    );
  });
});
