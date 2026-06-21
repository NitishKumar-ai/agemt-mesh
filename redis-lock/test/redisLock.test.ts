import { describe, it, expect } from 'vitest';
import { createRedisAdapter, createInProcessAdapter } from '../src/index.js';

describe('redis adapter (in-process fallback)', () => {
  it('falls back to in-process when REDIS_URL is unset', async () => {
    const adapter = await createRedisAdapter(undefined);
    expect(adapter.backend).toBe('in-process');
    await adapter.close();
  });

  it('falls back to in-process when Redis is unreachable', async () => {
    // Reserved, almost certainly closed port -> connect fails fast.
    const adapter = await createRedisAdapter('redis://127.0.0.1:6390', { connectTimeoutMs: 300 });
    expect(adapter.backend).toBe('in-process');
    await adapter.close();
  });

  it('grants a lock to only one holder until released', async () => {
    const { lock } = createInProcessAdapter();
    const a = await lock.acquire('sched:job-1', 1000);
    const b = await lock.acquire('sched:job-1', 1000);
    expect(a).not.toBeNull();
    expect(b).toBeNull();

    expect(await lock.release('sched:job-1', a as string)).toBe(true);
    const c = await lock.acquire('sched:job-1', 1000);
    expect(c).not.toBeNull();
  });

  it('release with a stale token does not free the lock', async () => {
    const { lock } = createInProcessAdapter();
    await lock.acquire('k', 1000);
    expect(await lock.release('k', 'wrong-token')).toBe(false);
  });

  it('withLock skips when the lock is already held', async () => {
    const { lock } = createInProcessAdapter();
    const held = await lock.acquire('k', 1000);
    expect(held).not.toBeNull();
    let ran = false;
    const result = await lock.withLock('k', 1000, async () => {
      ran = true;
      return 42;
    });
    expect(result.ran).toBe(false);
    expect(ran).toBe(false);
  });

  it('cache honors TTL expiry', async () => {
    const { cache } = createInProcessAdapter();
    await cache.set('k', 'v', 20);
    expect(await cache.get('k')).toBe('v');
    await new Promise((r) => setTimeout(r, 40));
    expect(await cache.get('k')).toBeNull();
  });
});
