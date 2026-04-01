import type { RateLimitRecord, RateLimitStore } from "../core/types";

export interface MemoryStoreOptions {
  /** Maximum number of entries. Default: 10_000 */
  maxEntries?: number;
  /** Cleanup interval in ms. Default: 60_000 */
  cleanupInterval?: number;
}

interface StoreEntry {
  record: RateLimitRecord;
  expiresAt: number;
}

/**
 * In-memory rate limit store with LRU eviction and automatic cleanup.
 *
 * Uses a JavaScript `Map` for O(1) get/set operations.
 * Insertion order is preserved for LRU eviction.
 * Expired entries are cleaned up on a configurable interval.
 */
export class MemoryStore implements RateLimitStore {
  private readonly store: Map<string, StoreEntry>;
  private readonly maxEntries: number;
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor(options: MemoryStoreOptions = {}) {
    this.maxEntries = options.maxEntries ?? 10_000;
    this.store = new Map();

    const cleanupInterval = options.cleanupInterval ?? 60_000;
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupInterval);

    // Allow the process to exit even if the timer is still active
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /** Get the record for a key. Returns null if not found or expired. */
  async get(key: string): Promise<RateLimitRecord | null> {
    const entry = this.store.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    // LRU: move to end by re-inserting
    this.store.delete(key);
    this.store.set(key, entry);

    return entry.record;
  }

  /** Set or update a record with the given TTL in milliseconds. */
  async set(key: string, record: RateLimitRecord, ttl: number): Promise<void> {
    // If key already exists, delete first to update insertion order
    this.store.delete(key);

    // Evict oldest if at capacity
    if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }

    this.store.set(key, {
      record,
      expiresAt: Date.now() + ttl,
    });
  }

  /** Atomically increment the counter. Creates the key with the given amount if it does not exist. */
  async increment(key: string, amount = 1): Promise<number> {
    const entry = this.store.get(key);

    if (!entry || Date.now() >= entry.expiresAt) {
      // Key doesn't exist or expired — create with value = amount
      // Delete first in case it was expired
      this.store.delete(key);

      // Evict oldest if at capacity
      if (this.store.size >= this.maxEntries) {
        const oldestKey = this.store.keys().next().value;
        if (oldestKey !== undefined) {
          this.store.delete(oldestKey);
        }
      }

      const now = Date.now();
      this.store.set(key, {
        record: {
          count: amount,
          createdAt: now,
          updatedAt: now,
        },
        // No TTL context here — use a default of 60s
        // The algorithm will call set() with the correct TTL afterwards
        expiresAt: now + 60_000,
      });

      return amount;
    }

    entry.record.count += amount;
    entry.record.updatedAt = Date.now();
    return entry.record.count;
  }

  /** Delete the record for the given key. */
  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  /** Delete all records. */
  async resetAll(): Promise<void> {
    this.store.clear();
  }

  /** Stop the cleanup timer and clear all records. */
  async shutdown(): Promise<void> {
    clearInterval(this.cleanupTimer);
    this.store.clear();
  }

  /** Always returns true for the in-memory store. */
  async isHealthy(): Promise<boolean> {
    return true;
  }

  /** Remove all expired entries */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now >= entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }
}
