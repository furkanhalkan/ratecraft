import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RateLimitRecord } from "../../../src/core/types";
import { RedisStore } from "../../../src/stores/redis";

/**
 * Mock Redis client that simulates basic ioredis methods.
 * Used for unit testing without a real Redis connection.
 */
function createMockRedis() {
  const store = new Map<string, { value: string; expiresAt: number | null }>();

  const mock = {
    get: vi.fn(async (key: string) => {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt && Date.now() >= entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.value;
    }),

    set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
      let expiresAt: number | null = null;
      // Handle "PX" ttl argument
      if (args[0] === "PX" && typeof args[1] === "number") {
        expiresAt = Date.now() + args[1];
      }
      store.set(key, { value, expiresAt });
      return "OK";
    }),

    incrby: vi.fn(async (key: string, amount: number) => {
      const entry = store.get(key);
      const current = entry ? Number(entry.value) : 0;
      const newVal = current + amount;
      store.set(key, { value: String(newVal), expiresAt: entry?.expiresAt ?? null });
      return newVal;
    }),

    del: vi.fn(async (...keys: string[]) => {
      let deleted = 0;
      for (const key of keys) {
        if (store.delete(key)) deleted++;
      }
      return deleted;
    }),

    keys: vi.fn(async (pattern: string) => {
      const prefix = pattern.replace("*", "");
      return [...store.keys()].filter((k) => k.startsWith(prefix));
    }),

    ping: vi.fn(async () => "PONG"),

    script: vi.fn(async (_cmd: string, _source: string) => {
      // Return a fake SHA
      return `fakeSha_${Math.random().toString(36).slice(2, 10)}`;
    }),

    evalsha: vi.fn(async (..._args: unknown[]) => {
      // For unit tests, we don't actually evaluate Lua
      // This will be tested with real Redis in e2e tests
      throw new Error("NOSCRIPT No matching script");
    }),

    eval: vi.fn(async (..._args: unknown[]) => {
      // Return a simulated result for fixed-window: [allowed, remaining, ttl]
      return [1, 9, 10000];
    }),
  };

  return { mock, store };
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

describe("RedisStore", () => {
  let redisStore: RedisStore;
  let mockRedis: ReturnType<typeof createMockRedis>["mock"];

  beforeEach(() => {
    const { mock } = createMockRedis();
    mockRedis = mock;
    redisStore = new RedisStore({
      client: mock as unknown as import("ioredis").Redis,
      prefix: "test:",
    });
  });

  // ──────────────────────────────────────────
  // get / set
  // ──────────────────────────────────────────
  describe("get", () => {
    it("should return null for non-existent key", async () => {
      const result = await redisStore.get("missing");
      expect(result).toBeNull();
      expect(mockRedis.get).toHaveBeenCalledWith("test:missing");
    });

    it("should return parsed record after set", async () => {
      const record = makeRecord({ count: 42 });
      await redisStore.set("mykey", record, 5_000);
      const result = await redisStore.get("mykey");

      expect(result).toEqual(record);
    });

    it("should return null for invalid JSON", async () => {
      mockRedis.get.mockResolvedValueOnce("not-valid-json");
      const result = await redisStore.get("badkey");
      expect(result).toBeNull();
    });
  });

  describe("set", () => {
    it("should call redis SET with PX ttl", async () => {
      const record = makeRecord();
      await redisStore.set("key1", record, 10_000);

      expect(mockRedis.set).toHaveBeenCalledWith("test:key1", JSON.stringify(record), "PX", 10_000);
    });
  });

  // ──────────────────────────────────────────
  // increment
  // ──────────────────────────────────────────
  describe("increment", () => {
    it("should increment by 1 by default", async () => {
      const result = await redisStore.increment("counter");
      expect(result).toBe(1);
      expect(mockRedis.incrby).toHaveBeenCalledWith("test:counter", 1);
    });

    it("should increment by custom amount", async () => {
      await redisStore.increment("counter", 5);
      const result = await redisStore.increment("counter", 3);
      expect(result).toBe(8);
    });
  });

  // ──────────────────────────────────────────
  // reset
  // ──────────────────────────────────────────
  describe("reset", () => {
    it("should delete the key", async () => {
      await redisStore.set("key1", makeRecord(), 5_000);
      await redisStore.reset("key1");

      expect(mockRedis.del).toHaveBeenCalledWith("test:key1");
    });
  });

  // ──────────────────────────────────────────
  // resetAll
  // ──────────────────────────────────────────
  describe("resetAll", () => {
    it("should delete all keys with prefix", async () => {
      await redisStore.set("a", makeRecord(), 5_000);
      await redisStore.set("b", makeRecord(), 5_000);
      await redisStore.resetAll();

      expect(mockRedis.keys).toHaveBeenCalledWith("test:*");
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it("should not call del when no keys exist", async () => {
      await redisStore.resetAll();
      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────
  // key prefix
  // ──────────────────────────────────────────
  describe("key prefix", () => {
    it("should apply prefix to all operations", async () => {
      await redisStore.set("mykey", makeRecord(), 5_000);
      expect(mockRedis.set).toHaveBeenCalledWith("test:mykey", expect.any(String), "PX", 5_000);

      await redisStore.get("mykey");
      expect(mockRedis.get).toHaveBeenCalledWith("test:mykey");
    });

    it("should use default prefix when not specified", () => {
      const store = new RedisStore({
        client: mockRedis as unknown as import("ioredis").Redis,
      });
      // Default prefix is "ratecraft:"
      store.get("testkey");
      expect(mockRedis.get).toHaveBeenCalledWith("ratecraft:testkey");
    });
  });

  // ──────────────────────────────────────────
  // shutdown
  // ──────────────────────────────────────────
  describe("shutdown", () => {
    it("should not close the externally provided client", async () => {
      await redisStore.shutdown();
      // No disconnect/quit should be called
      expect(mockRedis.ping).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────
  // isHealthy
  // ──────────────────────────────────────────
  describe("isHealthy", () => {
    it("should return true when ping succeeds", async () => {
      const result = await redisStore.isHealthy();
      expect(result).toBe(true);
    });

    it("should return false when ping fails", async () => {
      mockRedis.ping.mockRejectedValueOnce(new Error("Connection refused"));
      const result = await redisStore.isHealthy();
      expect(result).toBe(false);
    });
  });

  // ──────────────────────────────────────────
  // Lua script loading
  // ──────────────────────────────────────────
  describe("script loading", () => {
    it("should load scripts via SCRIPT LOAD on first use", async () => {
      // Make evalsha succeed so no extra NOSCRIPT reload happens
      mockRedis.evalsha.mockResolvedValueOnce([1, 9, 10000]);
      await redisStore.fixedWindowConsume("key", 10_000, 10, Date.now());

      // Should have called script LOAD for all 4 scripts
      expect(mockRedis.script).toHaveBeenCalledTimes(4);
    });

    it("should only load scripts once", async () => {
      mockRedis.evalsha.mockResolvedValue([1, 9, 10000]);
      await redisStore.fixedWindowConsume("key", 10_000, 10, Date.now());
      await redisStore.fixedWindowConsume("key", 10_000, 10, Date.now());

      // Still only 4 calls (from the first invocation)
      expect(mockRedis.script).toHaveBeenCalledTimes(4);
    });
  });

  // ──────────────────────────────────────────
  // EVALSHA → EVAL fallback
  // ──────────────────────────────────────────
  describe("EVALSHA NOSCRIPT fallback", () => {
    it("should fallback to EVAL when EVALSHA returns NOSCRIPT", async () => {
      await redisStore.fixedWindowConsume("key", 10_000, 10, Date.now());

      // evalsha was attempted first
      expect(mockRedis.evalsha).toHaveBeenCalled();
      // Then eval was used as fallback
      expect(mockRedis.eval).toHaveBeenCalled();
    });

    it("should reload the SHA after NOSCRIPT fallback", async () => {
      await redisStore.fixedWindowConsume("key", 10_000, 10, Date.now());

      // 4 initial loads + 1 reload after NOSCRIPT
      expect(mockRedis.script).toHaveBeenCalledTimes(5);
    });
  });

  // ──────────────────────────────────────────
  // TTL via Redis
  // ──────────────────────────────────────────
  describe("TTL", () => {
    it("should set TTL correctly via PX", async () => {
      await redisStore.set("ttlkey", makeRecord(), 5_000);

      expect(mockRedis.set).toHaveBeenCalledWith("test:ttlkey", expect.any(String), "PX", 5_000);
    });
  });
});
