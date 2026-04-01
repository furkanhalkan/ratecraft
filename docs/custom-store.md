# Custom Store Guide

RateCraft uses a pluggable storage interface. You can implement the `RateLimitStore` interface to use any storage backend — DynamoDB, PostgreSQL, SQLite, or even a remote API.

## The `RateLimitStore` interface

```typescript
import type { RateLimitStore, RateLimitRecord } from 'ratecraft';

interface RateLimitStore {
  // Required
  get(key: string): Promise<RateLimitRecord | null>;
  set(key: string, record: RateLimitRecord, ttl: number): Promise<void>;
  increment(key: string, amount?: number): Promise<number>;
  reset(key: string): Promise<void>;

  // Optional
  resetAll?(): Promise<void>;
  shutdown?(): Promise<void>;
  isHealthy?(): Promise<boolean>;
}
```

## The `RateLimitRecord` type

```typescript
interface RateLimitRecord {
  count: number;                        // Current counter or token value
  createdAt: number;                    // Unix timestamp (ms) when the record was created
  updatedAt: number;                    // Unix timestamp (ms) of the last update
  metadata?: Record<string, unknown>;   // Algorithm-specific data (must be JSON-serializable)
}
```

## Method requirements

### `get(key: string): Promise<RateLimitRecord | null>`

- Return the record for the given key, or `null` if the key does not exist.
- If the key has expired, return `null` and clean it up.

### `set(key: string, record: RateLimitRecord, ttl: number): Promise<void>`

- Store the record with the given TTL (in milliseconds).
- Overwrite any existing record for the same key.
- The store must automatically delete the record after the TTL expires.

### `increment(key: string, amount?: number): Promise<number>`

- Atomically increment the `count` field of the record.
- If the key does not exist, create a new record with `count` equal to `amount` (default: 1).
- Return the new count after incrementing.
- **Atomicity is critical** — concurrent calls must not result in lost increments.

### `reset(key: string): Promise<void>`

- Delete the record for the given key.
- Do not throw if the key does not exist.

### `resetAll?(): Promise<void>` *(optional)*

- Delete all records managed by this store.
- Called during cleanup or testing.

### `shutdown?(): Promise<void>` *(optional)*

- Clean up resources (close connections, stop timers).
- Called when the `RateCraft` instance is shut down.

### `isHealthy?(): Promise<boolean>` *(optional)*

- Return `true` if the store is accessible and operational.
- Used for health checks and monitoring.

## Example: SQLite store

```typescript
import type { RateLimitStore, RateLimitRecord } from 'ratecraft';
import Database from 'better-sqlite3';

export class SQLiteStore implements RateLimitStore {
  private db: Database.Database;

  constructor(filepath: string) {
    this.db = new Database(filepath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        record TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `);
  }

  async get(key: string): Promise<RateLimitRecord | null> {
    const row = this.db
      .prepare('SELECT record FROM rate_limits WHERE key = ? AND expires_at > ?')
      .get(key, Date.now()) as { record: string } | undefined;

    if (!row) return null;
    return JSON.parse(row.record);
  }

  async set(key: string, record: RateLimitRecord, ttl: number): Promise<void> {
    this.db
      .prepare('INSERT OR REPLACE INTO rate_limits (key, record, expires_at) VALUES (?, ?, ?)')
      .run(key, JSON.stringify(record), Date.now() + ttl);
  }

  async increment(key: string, amount: number = 1): Promise<number> {
    const existing = await this.get(key);
    if (!existing) {
      const now = Date.now();
      await this.set(key, { count: amount, createdAt: now, updatedAt: now }, 60_000);
      return amount;
    }
    existing.count += amount;
    existing.updatedAt = Date.now();
    // Preserve the remaining TTL
    const row = this.db
      .prepare('SELECT expires_at FROM rate_limits WHERE key = ?')
      .get(key) as { expires_at: number } | undefined;
    const remainingTtl = row ? row.expires_at - Date.now() : 60_000;
    await this.set(key, existing, Math.max(1000, remainingTtl));
    return existing.count;
  }

  async reset(key: string): Promise<void> {
    this.db.prepare('DELETE FROM rate_limits WHERE key = ?').run(key);
  }

  async resetAll(): Promise<void> {
    this.db.prepare('DELETE FROM rate_limits').run();
  }

  async shutdown(): Promise<void> {
    this.db.close();
  }

  async isHealthy(): Promise<boolean> {
    try {
      this.db.prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }
}
```

## Important considerations

1. **Atomicity** — The `increment` method must be atomic. Use database-level atomic operations (e.g., `INCR` in Redis, `UPDATE ... SET count = count + 1` in SQL) to avoid race conditions.

2. **TTL enforcement** — Records must expire after the specified TTL. Some backends handle this natively (Redis `PEXPIRE`, Memcached TTL). For others, implement cleanup via periodic sweeps or check expiration on `get`.

3. **Serialization** — `RateLimitRecord.metadata` can contain nested objects and arrays. Ensure your serialization handles these correctly (JSON is recommended).

4. **Connection management** — If your store wraps an external client (database connection, Redis client), do not close it in `shutdown()` if it was provided externally. Only close resources that the store itself created.

5. **Error handling** — Let errors propagate naturally. RateCraft's `failStrategy` and `fallbackStore` handle store failures at a higher level.
