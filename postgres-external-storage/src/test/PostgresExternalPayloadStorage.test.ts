import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostgresExternalPayloadStorage } from '../PostgresExternalPayloadStorage.js';
import { Pool } from 'pg';

describe('PostgresExternalPayloadStorage', () => {
  it('stores and retrieves a payload via mocked pool', async () => {
    const pool = {
      query: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
    } as unknown as Pool;

    // Mock insert
    (pool.query as any).mockResolvedValueOnce({ rowCount: 1, rows: [] });

    // Mock select
    const dataBuffer = Buffer.from('{"x":1}', 'utf-8');
    (pool.query as any).mockResolvedValueOnce({
      rows: [{ data: dataBuffer }],
    });

    const storage = new PostgresExternalPayloadStorage({ pool });
    const uri = await storage.store('workflow/input/test.json', '{"x":1}');

    expect(uri).toContain('postgres://external_payload/workflow/input/test.json');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO external_payload'),
      expect.any(Array),
    );

    const result = await storage.get('workflow/input/test.json');
    expect(result).toBe('{"x":1}');
  });

  it('returns null for missing payload', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      end: vi.fn().mockResolvedValue(undefined),
    } as unknown as Pool;

    const storage = new PostgresExternalPayloadStorage({ pool });
    const result = await storage.get('nonexistent.json');
    expect(result).toBeNull();
  });

  it('removes a payload', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rowCount: 1 }),
      end: vi.fn().mockResolvedValue(undefined),
    } as unknown as Pool;

    const storage = new PostgresExternalPayloadStorage({ pool });
    const deleted = await storage.remove('tasks/t1.json');
    expect(deleted).toBe(true);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM external_payload'),
      ['tasks/t1.json'],
    );
  });

  it('throws on signed URL', async () => {
    const pool = {
      query: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
    } as unknown as Pool;

    const storage = new PostgresExternalPayloadStorage({ pool });
    await expect(storage.getSignedUrl('x', 300)).rejects.toThrow(
      'not supported',
    );
  });
});
