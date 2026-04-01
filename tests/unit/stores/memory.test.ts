import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RateLimitRecord } from "../../../src/core/types";
import { MemoryStore } from "../../../src/stores/memory";

function makeRecord(overrides: Partial<RateLimitRecord> = {}): RateLimitRecord {
  const now = Date.now();
  return {
    count: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("MemoryStore", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore({ cleanupInterval: 60_000 });
  });

  afterEach(async () => {
    await store.shutdown();
  });

  // ──────────────────────────────────────────
  // get
  // ──────────────────────────────────────────
  describe("get", () => {
    it("should return null for a non-existent key", async () => {
      const result = await store.get("nonexistent");
      expect(result).toBeNull();
    });

    it("should return the record after set", async () => {
      const record = makeRecord({ count: 5 });
      await store.set("key1", record, 10_000);
      const result = await store.get("key1");
      expect(result).toEqual(record);
    });

    it("should return null for an expired key", async () => {
      const record = makeRecord();
      await store.set("key1", record, 100); // 100ms TTL

      // Advance time past TTL
      vi.useFakeTimers();
      vi.advanceTimersByTime(150);

      const result = await store.get("key1");
      expect(result).toBeNull();

      vi.useRealTimers();
    });
  });

  // ──────────────────────────────────────────
  // set
  // ──────────────────────────────────────────
  describe("set", () => {
    it("should store and retrieve a record", async () => {
      const record = makeRecord({ count: 42 });
      await store.set("mykey", record, 5_000);
      const result = await store.get("mykey");
      expect(result).toEqual(record);
    });

    it("should overwrite an existing record", async () => {
      const r1 = makeRecord({ count: 1 });
      const r2 = makeRecord({ count: 99 });
      await store.set("key", r1, 5_000);
      await store.set("key", r2, 5_000);
      const result = await store.get("key");
      expect(result?.count).toBe(99);
    });
  });

  // ──────────────────────────────────────────
  // increment
  // ──────────────────────────────────────────
  describe("increment", () => {
    it("should return 1 for a non-existent key", async () => {
      const result = await store.increment("new");
      expect(result).toBe(1);
    });

    it("should increment an existing key", async () => {
      const record = makeRecord({ count: 5 });
      await store.set("key", record, 10_000);
      const result = await store.increment("key");
      expect(result).toBe(6);
    });

    it("should increment by a custom amount", async () => {
      const record = makeRecord({ count: 10 });
      await store.set("key", record, 10_000);
      const result = await store.increment("key", 3);
      expect(result).toBe(13);
    });

    it("should treat an expired key as non-existent", async () => {
      const record = makeRecord({ count: 50 });
      await store.set("key", record, 100);

      vi.useFakeTimers();
      vi.advanceTimersByTime(150);

      const result = await store.increment("key");
      expect(result).toBe(1);

      vi.useRealTimers();
    });
  });

  // ──────────────────────────────────────────
  // reset
  // ──────────────────────────────────────────
  describe("reset", () => {
    it("should delete a key", async () => {
      await store.set("key", makeRecord(), 10_000);
      await store.reset("key");
      const result = await store.get("key");
      expect(result).toBeNull();
    });

    it("should not throw when resetting a non-existent key", async () => {
      await expect(store.reset("nonexistent")).resolves.toBeUndefined();
    });
  });

  // ──────────────────────────────────────────
  // resetAll
  // ──────────────────────────────────────────
  describe("resetAll", () => {
    it("should clear all keys", async () => {
      await store.set("a", makeRecord(), 10_000);
      await store.set("b", makeRecord(), 10_000);
      await store.set("c", makeRecord(), 10_000);
      await store.resetAll();
      expect(await store.get("a")).toBeNull();
      expect(await store.get("b")).toBeNull();
      expect(await store.get("c")).toBeNull();
    });
  });

  // ──────────────────────────────────────────
  // TTL
  // ──────────────────────────────────────────
  describe("TTL", () => {
    it("should expire a record after TTL", async () => {
      vi.useFakeTimers();

      const s = new MemoryStore({ cleanupInterval: 600_000 });
      await s.set("key", makeRecord(), 500);

      // Before expiry
      expect(await s.get("key")).not.toBeNull();

      // After expiry
      vi.advanceTimersByTime(600);
      expect(await s.get("key")).toBeNull();

      await s.shutdown();
      vi.useRealTimers();
    });
  });

  // ──────────────────────────────────────────
  // LRU eviction
  // ──────────────────────────────────────────
  describe("LRU eviction", () => {
    it("should evict the oldest entry when maxEntries is exceeded", async () => {
      const s = new MemoryStore({ maxEntries: 3, cleanupInterval: 600_000 });

      await s.set("a", makeRecord({ count: 1 }), 60_000);
      await s.set("b", makeRecord({ count: 2 }), 60_000);
      await s.set("c", makeRecord({ count: 3 }), 60_000);

      // Adding a 4th should evict 'a' (oldest)
      await s.set("d", makeRecord({ count: 4 }), 60_000);

      expect(await s.get("a")).toBeNull();
      expect(await s.get("b")).not.toBeNull();
      expect(await s.get("c")).not.toBeNull();
      expect(await s.get("d")).not.toBeNull();

      await s.shutdown();
    });

    it("should refresh LRU order on get", async () => {
      const s = new MemoryStore({ maxEntries: 3, cleanupInterval: 600_000 });

      await s.set("a", makeRecord({ count: 1 }), 60_000);
      await s.set("b", makeRecord({ count: 2 }), 60_000);
      await s.set("c", makeRecord({ count: 3 }), 60_000);

      // Access 'a' — moves it to the end, 'b' becomes oldest
      await s.get("a");

      // Adding 'd' should evict 'b' (now oldest)
      await s.set("d", makeRecord({ count: 4 }), 60_000);

      expect(await s.get("a")).not.toBeNull();
      expect(await s.get("b")).toBeNull();
      expect(await s.get("c")).not.toBeNull();
      expect(await s.get("d")).not.toBeNull();

      await s.shutdown();
    });
  });

  // ──────────────────────────────────────────
  // Cleanup interval
  // ──────────────────────────────────────────
  describe("cleanup", () => {
    it("should remove expired entries during cleanup", async () => {
      vi.useFakeTimers();

      const s = new MemoryStore({ cleanupInterval: 1_000 });
      await s.set("short", makeRecord(), 500);
      await s.set("long", makeRecord(), 10_000);

      // Advance past short TTL and trigger cleanup
      vi.advanceTimersByTime(1_500);

      expect(await s.get("short")).toBeNull();
      expect(await s.get("long")).not.toBeNull();

      await s.shutdown();
      vi.useRealTimers();
    });
  });

  // ──────────────────────────────────────────
  // shutdown
  // ──────────────────────────────────────────
  describe("shutdown", () => {
    it("should clear the store and stop the cleanup interval", async () => {
      await store.set("key", makeRecord(), 10_000);
      await store.shutdown();
      // After shutdown the store is empty
      // Creating a new get after shutdown — internal map is cleared
      expect(await store.get("key")).toBeNull();
    });
  });

  // ──────────────────────────────────────────
  // isHealthy
  // ──────────────────────────────────────────
  describe("isHealthy", () => {
    it("should always return true", async () => {
      expect(await store.isHealthy()).toBe(true);
    });
  });
});
