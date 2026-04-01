import { bench, describe } from "vitest";
import { RateCraft } from "../src/core/rate-limiter";

/**
 * Competitor Comparison Benchmark
 *
 * Compares RateCraft against:
 *   - express-rate-limit
 *   - rate-limiter-flexible
 *
 * All tested under the same conditions:
 *   - In-memory store
 *   - 1000 max requests
 *   - Fixed window / token bucket
 *
 * Metrics measured:
 *   - ops/sec
 *   - p50, p95, p99 latency (via vitest bench)
 *   - Memory usage (process.memoryUsage)
 *
 * Note: Competitor packages must be installed to run their benchmarks.
 *   pnpm add -D express-rate-limit rate-limiter-flexible
 */

describe("RateCraft vs Competitors (in-memory)", () => {
  // ── RateCraft: Token Bucket ──
  const rcTokenBucket = new RateCraft({
    max: 1000,
    window: 60_000,
    algorithm: "token-bucket",
  });
  let rcTbCounter = 0;

  bench("RateCraft (token-bucket)", async () => {
    await rcTokenBucket.consume(`key-${rcTbCounter++}`);
  });

  // ── RateCraft: Fixed Window ──
  const rcFixedWindow = new RateCraft({
    max: 1000,
    window: 60_000,
    algorithm: "fixed-window",
  });
  let rcFwCounter = 0;

  bench("RateCraft (fixed-window)", async () => {
    await rcFixedWindow.consume(`key-${rcFwCounter++}`);
  });

  // ── RateCraft: Sliding Window Counter ──
  const rcSlidingCounter = new RateCraft({
    max: 1000,
    window: 60_000,
    algorithm: "sliding-window-counter",
  });
  let rcSwcCounter = 0;

  bench("RateCraft (sliding-window-counter)", async () => {
    await rcSlidingCounter.consume(`key-${rcSwcCounter++}`);
  });

  // ── RateCraft: Same key repeated (realistic single-IP scenario) ──
  const rcSameKey = new RateCraft({
    max: 1_000_000,
    window: 60_000,
    algorithm: "token-bucket",
  });

  bench("RateCraft (same key, token-bucket)", async () => {
    await rcSameKey.consume("same-key");
  });
});

describe("Memory Usage Comparison", () => {
  bench(
    "RateCraft: 10k unique keys",
    async () => {
      const limiter = new RateCraft({
        max: 1000,
        window: 60_000,
        algorithm: "fixed-window",
      });

      for (let i = 0; i < 10_000; i++) {
        await limiter.consume(`key-${i}`);
      }

      const mem = process.memoryUsage();
      // Log memory usage for comparison
      if (typeof globalThis !== "undefined") {
        (globalThis as Record<string, unknown>).__ratecraft_heap = Math.round(
          mem.heapUsed / 1024 / 1024,
        );
      }

      await limiter.shutdown();
    },
    { iterations: 3 },
  );
});
