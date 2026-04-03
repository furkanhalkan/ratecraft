import type Memcached from "memcached";
import type { RateLimitRecord, RateLimitStore } from "../core/types";

export interface MemcachedStoreOptions {
  /** Memcached client instance */
  client: Memcached;
  /** Key prefix. Default: "ratecraft:" */
  prefix?: string;
}

/** Shape returned by memcached.gets() */
interface GetsResult {
  [key: string]: unknown;
  cas: string;
}

/**
 * Memcached-backed store for RateCraft.
 *
 * Uses CAS (Check-And-Set) for atomic increment operations.
 * TTL is in seconds (Memcached does not support ms).
 */
export class MemcachedStore implements RateLimitStore {
  private readonly client: Memcached;
  private readonly prefix: string;

  constructor(options: MemcachedStoreOptions) {
    this.client = options.client;
    this.prefix = options.prefix ?? "ratecraft:";
  }

  private prefixKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  /** Convert ms TTL to seconds (minimum 1 second). */
  private ttlToSeconds(ttlMs: number): number {
    return Math.max(1, Math.ceil(ttlMs / 1000));
  }

  /** Get the record for a key. Returns null if not found or unparseable. */
  async get(key: string): Promise<RateLimitRecord | null> {
    return new Promise((resolve) => {
      this.client.get(this.prefixKey(key), (err: Error | undefined, data: unknown) => {
        if (err || data === undefined) {
          resolve(null);
          return;
        }

        try {
          resolve(JSON.parse(data as string) as RateLimitRecord);
        } catch {
          resolve(null);
        }
      });
    });
  }

  /** Set or update a record. TTL is converted to seconds (Memcached does not support ms). */
  async set(key: string, record: RateLimitRecord, ttl: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.set(
        this.prefixKey(key),
        JSON.stringify(record),
        this.ttlToSeconds(ttl),
        (err: Error | undefined) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        },
      );
    });
  }

  /**
   * Atomically increment the counter for a key using CAS.
   * If the key does not exist, create it with value = amount.
   */
  async increment(key: string, amount = 1): Promise<number> {
    const prefixed = this.prefixKey(key);

    return new Promise((resolve, reject) => {
      this.client.gets(prefixed, (err: Error | undefined, data: GetsResult) => {
        if (err) {
          reject(err);
          return;
        }

        if (!data) {
          // Key doesn't exist — create with initial value
          const now = Date.now();
          const record: RateLimitRecord = {
            count: amount,
            createdAt: now,
            updatedAt: now,
          };
          // Use add to avoid race condition (only sets if key doesn't exist)
          this.client.add(prefixed, JSON.stringify(record), 60, (addErr: Error | undefined) => {
            if (addErr) {
              // Another process may have created it — retry via CAS
              this.client.gets(prefixed, (retryErr: Error | undefined, retryData: GetsResult) => {
                if (retryErr || retryData === undefined || (retryData as unknown) === false) {
                  reject(
                    retryErr ??
                      new Error(
                        `Memcached increment failed for key "${key}": could not read key after add conflict`,
                      ),
                  );
                  return;
                }
                this.casUpdate(prefixed, retryData, amount, resolve, reject);
              });
              return;
            }
            resolve(amount);
          });
          return;
        }

        // Key exists — CAS update
        this.casUpdate(prefixed, data, amount, resolve, reject);
      });
    });
  }

  /** Perform a CAS (Check-And-Set) update to atomically increment the count. */
  private casUpdate(
    prefixedKey: string,
    data: GetsResult,
    amount: number,
    resolve: (value: number) => void,
    reject: (reason: unknown) => void,
  ): void {
    const cas = data.cas;
    let record: RateLimitRecord;

    try {
      // Find the actual value — it's the first non-cas property
      const valueKey = Object.keys(data).find((k) => k !== "cas");
      if (!valueKey) {
        reject(new Error(`Memcached CAS response for key "${prefixedKey}" contained no value`));
        return;
      }
      record = JSON.parse(data[valueKey] as string) as RateLimitRecord;
    } catch {
      reject(
        new Error(
          `Memcached failed to parse stored record for key "${prefixedKey}": data is not valid JSON`,
        ),
      );
      return;
    }

    record.count += amount;
    record.updatedAt = Date.now();

    this.client.cas(prefixedKey, JSON.stringify(record), cas, 60, (casErr: Error | undefined) => {
      if (casErr) {
        reject(casErr);
        return;
      }
      resolve(record.count);
    });
  }

  /** Delete the record for the given key. */
  async reset(key: string): Promise<void> {
    return new Promise((resolve) => {
      this.client.del(this.prefixKey(key), () => {
        resolve();
      });
    });
  }

  /** Flush all keys from Memcached. */
  async resetAll(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.flush((err: Error | undefined) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  /** No-op — the Memcached client is managed externally. */
  async shutdown(): Promise<void> {
    // Don't close the client — it was provided externally
  }

  /** Check connectivity via Memcached version command. */
  async isHealthy(): Promise<boolean> {
    return new Promise((resolve) => {
      this.client.version((err: Error | undefined) => {
        resolve(!err);
      });
    });
  }
}
