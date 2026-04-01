import { bench, describe } from "vitest";
import type { RateLimitRecord } from "../src/core/types";
import { MemoryStore } from "../src/stores/memory";

/**
 * Store Benchmarks
 *
 * Target performance (ops/sec):
 *   MemoryStore:      1,000,000+ (Map access only)
 *   RedisStore:          50,000+ (network latency included — requires real Redis)
 *   MemcachedStore:      50,000+ (network latency included — requires real Memcached)
 *
 * Note: Redis and Memcached benchmarks require running servers
 * and are intended for CI or local testing with services available.
 */

function makeRecord(count = 1): RateLimitRecord {
  const now = Date.now();
  return { count, createdAt: now, updatedAt: now };
}

describe("MemoryStore Benchmarks", () => {
  // ── set ──
  const setStore = new MemoryStore({ maxEntries: 1_000_000, cleanupInterval: 600_000 });
  let setCounter = 0;

  bench("MemoryStore.set", async () => {
    await setStore.set(`key-${setCounter++}`, makeRecord(), 60_000);
  });

  // ── get (existing key) ──
  const getStore = new MemoryStore({ maxEntries: 1_000_000, cleanupInterval: 600_000 });
  // Pre-populate
  for (let i = 0; i < 10_000; i++) {
    getStore.set(`key-${i}`, makeRecord(i), 600_000);
  }
  let getCounter = 0;

  bench("MemoryStore.get (hit)", async () => {
    await getStore.get(`key-${getCounter++ % 10_000}`);
  });

  // ── get (miss) ──
  const missStore = new MemoryStore({ maxEntries: 1_000_000, cleanupInterval: 600_000 });
  let missCounter = 0;

  bench("MemoryStore.get (miss)", async () => {
    await missStore.get(`nonexistent-${missCounter++}`);
  });

  // ── increment ──
  const incrStore = new MemoryStore({ maxEntries: 1_000_000, cleanupInterval: 600_000 });
  // Pre-populate
  for (let i = 0; i < 10_000; i++) {
    incrStore.set(`key-${i}`, makeRecord(0), 600_000);
  }
  let incrCounter = 0;

  bench("MemoryStore.increment", async () => {
    await incrStore.increment(`key-${incrCounter++ % 10_000}`);
  });

  // ── LRU eviction pressure ──
  const lruStore = new MemoryStore({ maxEntries: 1_000, cleanupInterval: 600_000 });
  let lruCounter = 0;

  bench("MemoryStore.set (LRU eviction)", async () => {
    await lruStore.set(`key-${lruCounter++}`, makeRecord(), 60_000);
  });
});

describe("Memory Usage", () => {
  bench(
    "10k entries memory footprint",
    async () => {
      const store = new MemoryStore({ maxEntries: 100_000, cleanupInterval: 600_000 });
      for (let i = 0; i < 10_000; i++) {
        await store.set(`key-${i}`, makeRecord(i), 60_000);
      }
      await store.shutdown();
    },
    { iterations: 5 },
  );
});
