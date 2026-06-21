import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';

/**
 * Distributed lock primitive. A successful acquire returns an opaque fence
 * token that must be presented to release; release is a no-op if the token no
 * longer owns the key (it expired and someone else took it). This prevents a
 * slow holder from releasing a lock it no longer owns.
 */
export interface DistributedLock {
  acquire(key: string, ttlMs: number): Promise<string | null>;
  release(key: string, token: string): Promise<boolean>;
  /**
   * Run fn only if the lock is acquired. Returns { ran: false } when the lock
   * is already held elsewhere, so callers can distinguish "skipped" from a
   * function that legitimately returned undefined.
   */
  withLock<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<{ ran: true; value: T } | { ran: false }>;
}

export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs?: number): Promise<void>;
  del(key: string): Promise<void>;
}

export interface RedisAdapter {
  readonly backend: 'redis' | 'in-process';
  readonly lock: DistributedLock;
  readonly cache: Cache;
  close(): Promise<void>;
}

// Lua: release only if the stored token still matches (atomic compare-and-del).
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

class RedisLock implements DistributedLock {
  constructor(private readonly client: Redis) {}

  async acquire(key: string, ttlMs: number): Promise<string | null> {
    const token = randomUUID();
    // SET key token NX PX ttl -> only sets if absent, with expiry.
    const res = await this.client.set(key, token, 'PX', ttlMs, 'NX');
    return res === 'OK' ? token : null;
  }

  async release(key: string, token: string): Promise<boolean> {
    const res = (await this.client.eval(RELEASE_SCRIPT, 1, key, token)) as number;
    return res === 1;
  }

  async withLock<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<{ ran: true; value: T } | { ran: false }> {
    const token = await this.acquire(key, ttlMs);
    if (!token) return { ran: false };
    try {
      return { ran: true, value: await fn() };
    } finally {
      await this.release(key, token);
    }
  }
}

class RedisCache implements Cache {
  constructor(private readonly client: Redis) {}
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }
  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    if (ttlMs && ttlMs > 0) await this.client.set(key, value, 'PX', ttlMs);
    else await this.client.set(key, value);
  }
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }
}

/**
 * Single-process fallback used when REDIS_URL is unset or unreachable. Correct
 * only within one process; multi-instance deployments must configure Redis.
 */
class InProcessLock implements DistributedLock {
  private readonly held = new Map<string, { token: string; expiresAt: number }>();

  private live(key: string): { token: string; expiresAt: number } | null {
    const e = this.held.get(key);
    if (!e) return null;
    if (e.expiresAt <= Date.now()) {
      this.held.delete(key);
      return null;
    }
    return e;
  }

  async acquire(key: string, ttlMs: number): Promise<string | null> {
    if (this.live(key)) return null;
    const token = randomUUID();
    this.held.set(key, { token, expiresAt: Date.now() + ttlMs });
    return token;
  }

  async release(key: string, token: string): Promise<boolean> {
    const e = this.live(key);
    if (e && e.token === token) {
      this.held.delete(key);
      return true;
    }
    return false;
  }

  async withLock<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<{ ran: true; value: T } | { ran: false }> {
    const token = await this.acquire(key, ttlMs);
    if (!token) return { ran: false };
    try {
      return { ran: true, value: await fn() };
    } finally {
      await this.release(key, token);
    }
  }
}

class InProcessCache implements Cache {
  private readonly store = new Map<string, { value: string; expiresAt: number | null }>();
  async get(key: string): Promise<string | null> {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.expiresAt !== null && e.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return e.value;
  }
  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    this.store.set(key, { value, expiresAt: ttlMs && ttlMs > 0 ? Date.now() + ttlMs : null });
  }
  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export function createInProcessAdapter(): RedisAdapter {
  return {
    backend: 'in-process',
    lock: new InProcessLock(),
    cache: new InProcessCache(),
    close: async () => {},
  };
}

/**
 * Build a Redis-backed adapter, or fall back to an in-process one. Mirrors the
 * codebase's env-gated graceful-fallback pattern (see Neo4jClient): when
 * REDIS_URL is unset the server runs single-node with no external dependency,
 * and a connection failure logs and degrades rather than crashing boot.
 */
export async function createRedisAdapter(
  redisUrl?: string,
  opts: { connectTimeoutMs?: number } = {},
): Promise<RedisAdapter> {
  if (!redisUrl) {
    console.log('No REDIS_URL set. Using in-process lock/cache (single-node only).');
    return createInProcessAdapter();
  }

  const client = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: opts.connectTimeoutMs ?? 5000,
  });
  // Avoid an unhandled 'error' event taking down the process if Redis drops.
  client.on('error', (err: Error) => console.error('[redis] client error:', err.message));

  try {
    await client.connect();
    await client.ping();
    console.log(`Connected to Redis at ${redisUrl}. Distributed lock/cache enabled.`);
    return {
      backend: 'redis',
      lock: new RedisLock(client),
      cache: new RedisCache(client),
      close: async () => {
        await client.quit().catch(() => client.disconnect());
      },
    };
  } catch (err) {
    console.error(
      `[redis] Failed to connect at ${redisUrl}; falling back to in-process lock/cache:`,
      (err as Error).message,
    );
    client.disconnect();
    return createInProcessAdapter();
  }
}
