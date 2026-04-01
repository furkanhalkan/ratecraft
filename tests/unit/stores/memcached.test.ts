import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RateLimitRecord } from "../../../src/core/types";
import { MemcachedStore } from "../../../src/stores/memcached";

/**
 * Mock Memcached client that simulates callback-based API.
 */
function createMockMemcached() {
  const store = new Map<string, { value: string; cas: string }>();
  let casCounter = 0;

  const mock = {
    get: vi.fn((key: string, cb: (err: Error | undefined, data: unknown) => void) => {
      const entry = store.get(key);
      cb(undefined, entry ? entry.value : undefined);
    }),

    gets: vi.fn((key: string, cb: (err: Error | undefined, data: unknown) => void) => {
      const entry = store.get(key);
      if (!entry) {
        cb(undefined, undefined);
        return;
      }
      // memcached.gets returns { [key]: value, cas: token }
      cb(undefined, { [key]: entry.value, cas: entry.cas });
    }),

    set: vi.fn((key: string, value: string, ttl: number, cb: (err: Error | undefined) => void) => {
      casCounter++;
      store.set(key, { value, cas: String(casCounter) });
      cb(undefined);
    }),

    add: vi.fn((key: string, value: string, ttl: number, cb: (err: Error | undefined) => void) => {
      if (store.has(key)) {
        cb(new Error("Item is not stored"));
        return;
      }
      casCounter++;
      store.set(key, { value, cas: String(casCounter) });
      cb(undefined);
    }),

    cas: vi.fn(
      (
        key: string,
        value: string,
        cas: string,
        ttl: number,
        cb: (err: Error | undefined) => void,
      ) => {
        const entry = store.get(key);
        if (!entry || entry.cas !== cas) {
          cb(new Error("CAS mismatch"));
          return;
        }
        casCounter++;
        store.set(key, { value, cas: String(casCounter) });
        cb(undefined);
      },
    ),

    del: vi.fn((key: string, cb: (err: Error | undefined) => void) => {
      store.delete(key);
      cb(undefined);
    }),

    flush: vi.fn((cb: (err: Error | undefined) => void) => {
      store.clear();
      cb(undefined);
    }),

    version: vi.fn((cb: (err: Error | undefined) => void) => {
      cb(undefined);
    }),

    end: vi.fn(),

    // Expose for test inspection
    _store: store,
  };

  return mock;
}

function makeRecord(overrides: Partial<RateLimitRecord> = {}): RateLimitRecord {
  const now = Date.now();
  return {
    count: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("MemcachedStore", () => {
  let memcachedStore: MemcachedStore;
  let mockClient: ReturnType<typeof createMockMemcached>;

  beforeEach(() => {
    mockClient = createMockMemcached();
    memcachedStore = new MemcachedStore({
      client: mockClient as unknown as import("memcached"),
      prefix: "test:",
    });
  });

  // ──────────────────────────────────────────
  // get
  // ──────────────────────────────────────────
  describe("get", () => {
    it("should return null for non-existent key", async () => {
      const result = await memcachedStore.get("missing");
      expect(result).toBeNull();
      expect(mockClient.get).toHaveBeenCalledWith("test:missing", expect.any(Function));
    });

    it("should return parsed record after set", async () => {
      const record = makeRecord({ count: 42 });
      await memcachedStore.set("mykey", record, 5_000);
      const result = await memcachedStore.get("mykey");
      expect(result).toEqual(record);
    });

    it("should return null for invalid JSON", async () => {
      // Directly put invalid data in the store
      mockClient._store.set("test:badkey", { value: "not-json", cas: "1" });
      const result = await memcachedStore.get("badkey");
      expect(result).toBeNull();
    });
  });

  // ──────────────────────────────────────────
  // set
  // ──────────────────────────────────────────
  describe("set", () => {
    it("should store a record with TTL in seconds", async () => {
      const record = makeRecord();
      await memcachedStore.set("key1", record, 10_000);

      expect(mockClient.set).toHaveBeenCalledWith(
        "test:key1",
        JSON.stringify(record),
        10, // 10000ms → 10s
        expect.any(Function),
      );
    });

    it("should ceil TTL to minimum 1 second", async () => {
      const record = makeRecord();
      await memcachedStore.set("key1", record, 500); // 500ms → ceil → 1s

      expect(mockClient.set).toHaveBeenCalledWith(
        "test:key1",
        JSON.stringify(record),
        1,
        expect.any(Function),
      );
    });

    it("should overwrite existing record", async () => {
      const r1 = makeRecord({ count: 1 });
      const r2 = makeRecord({ count: 99 });
      await memcachedStore.set("key", r1, 5_000);
      await memcachedStore.set("key", r2, 5_000);

      const result = await memcachedStore.get("key");
      expect(result?.count).toBe(99);
    });
  });

  // ──────────────────────────────────────────
  // increment
  // ──────────────────────────────────────────
  describe("increment", () => {
    it("should return amount for non-existent key (creates new)", async () => {
      const result = await memcachedStore.increment("new");
      expect(result).toBe(1);
    });

    it("should increment an existing key via CAS", async () => {
      const record = makeRecord({ count: 5 });
      await memcachedStore.set("key", record, 10_000);

      const result = await memcachedStore.increment("key");
      expect(result).toBe(6);
      expect(mockClient.cas).toHaveBeenCalled();
    });

    it("should increment by a custom amount", async () => {
      const record = makeRecord({ count: 10 });
      await memcachedStore.set("key", record, 10_000);

      const result = await memcachedStore.increment("key", 3);
      expect(result).toBe(13);
    });

    it("should use add for new keys to avoid race conditions", async () => {
      await memcachedStore.increment("new-key");
      expect(mockClient.add).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────
  // reset
  // ──────────────────────────────────────────
  describe("reset", () => {
    it("should delete a key", async () => {
      await memcachedStore.set("key", makeRecord(), 5_000);
      await memcachedStore.reset("key");

      expect(mockClient.del).toHaveBeenCalledWith("test:key", expect.any(Function));
      const result = await memcachedStore.get("key");
      expect(result).toBeNull();
    });

    it("should not throw when deleting non-existent key", async () => {
      await expect(memcachedStore.reset("nonexistent")).resolves.toBeUndefined();
    });
  });

  // ──────────────────────────────────────────
  // resetAll
  // ──────────────────────────────────────────
  describe("resetAll", () => {
    it("should flush all keys", async () => {
      await memcachedStore.set("a", makeRecord(), 5_000);
      await memcachedStore.set("b", makeRecord(), 5_000);
      await memcachedStore.resetAll();

      expect(mockClient.flush).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────
  // key prefix
  // ──────────────────────────────────────────
  describe("key prefix", () => {
    it("should apply prefix to all operations", async () => {
      await memcachedStore.set("mykey", makeRecord(), 5_000);
      expect(mockClient.set).toHaveBeenCalledWith(
        "test:mykey",
        expect.any(String),
        expect.any(Number),
        expect.any(Function),
      );

      await memcachedStore.get("mykey");
      expect(mockClient.get).toHaveBeenCalledWith("test:mykey", expect.any(Function));
    });

    it("should use default prefix when not specified", () => {
      const store = new MemcachedStore({
        client: mockClient as unknown as import("memcached"),
      });
      store.get("testkey");
      expect(mockClient.get).toHaveBeenCalledWith("ratecraft:testkey", expect.any(Function));
    });
  });

  // ──────────────────────────────────────────
  // shutdown
  // ──────────────────────────────────────────
  describe("shutdown", () => {
    it("should not close the externally provided client", async () => {
      await memcachedStore.shutdown();
      expect(mockClient.end).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────
  // isHealthy
  // ──────────────────────────────────────────
  describe("isHealthy", () => {
    it("should return true when version succeeds", async () => {
      const result = await memcachedStore.isHealthy();
      expect(result).toBe(true);
    });

    it("should return false when version fails", async () => {
      mockClient.version.mockImplementationOnce((cb: (err: Error | undefined) => void) =>
        cb(new Error("Connection refused")),
      );
      const result = await memcachedStore.isHealthy();
      expect(result).toBe(false);
    });
  });

  // ──────────────────────────────────────────
  // TTL conversion
  // ──────────────────────────────────────────
  describe("TTL conversion", () => {
    it("should convert 60000ms to 60s", async () => {
      await memcachedStore.set("k", makeRecord(), 60_000);
      expect(mockClient.set).toHaveBeenCalledWith(
        "test:k",
        expect.any(String),
        60,
        expect.any(Function),
      );
    });

    it("should ceil 1500ms to 2s", async () => {
      await memcachedStore.set("k", makeRecord(), 1_500);
      expect(mockClient.set).toHaveBeenCalledWith(
        "test:k",
        expect.any(String),
        2,
        expect.any(Function),
      );
    });
  });
});
