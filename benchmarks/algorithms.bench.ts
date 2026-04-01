import { bench, describe } from "vitest";
import { FixedWindow } from "../src/core/algorithms/fixed-window";
import { SlidingWindowCounter } from "../src/core/algorithms/sliding-window-counter";
import { SlidingWindowLog } from "../src/core/algorithms/sliding-window-log";
import { TokenBucket } from "../src/core/algorithms/token-bucket";
import type { AlgorithmOptions } from "../src/core/types";
import { MemoryStore } from "../src/stores/memory";

/**
 * Algorithm Benchmarks
 *
 * Target performance (ops/sec):
 *   Token Bucket (memory):          500,000+ (min 200,000)
 *   Fixed Window (memory):          500,000+ (min 200,000)
 *   Sliding Window Counter (memory): 300,000+ (min 100,000)
 *   Sliding Window Log (memory):     50,000+ (min  20,000)
 */

const options: AlgorithmOptions = { max: 1_000_000, window: 60_000 };

describe("Algorithm Benchmarks (in-memory)", () => {
  // ── Token Bucket ──
  const tokenBucket = new TokenBucket();
  const tbStore = new MemoryStore({ maxEntries: 100_000, cleanupInterval: 600_000 });
  let tbCounter = 0;

  bench("Token Bucket", async () => {
    await tokenBucket.consume(`tb-${tbCounter++}`, tbStore, options);
  });

  // ── Fixed Window ──
  const fixedWindow = new FixedWindow();
  const fwStore = new MemoryStore({ maxEntries: 100_000, cleanupInterval: 600_000 });
  let fwCounter = 0;

  bench("Fixed Window", async () => {
    await fixedWindow.consume(`fw-${fwCounter++}`, fwStore, options);
  });

  // ── Sliding Window Counter ──
  const slidingCounter = new SlidingWindowCounter();
  const swcStore = new MemoryStore({ maxEntries: 100_000, cleanupInterval: 600_000 });
  let swcCounter = 0;

  bench("Sliding Window Counter", async () => {
    await slidingCounter.consume(`swc-${swcCounter++}`, swcStore, options);
  });

  // ── Sliding Window Log ──
  const slidingLog = new SlidingWindowLog();
  const swlStore = new MemoryStore({ maxEntries: 100_000, cleanupInterval: 600_000 });
  let swlCounter = 0;

  bench("Sliding Window Log", async () => {
    await slidingLog.consume(`swl-${swlCounter++}`, swlStore, options);
  });

  // ── Same-key stress (realistic: single IP hitting limit) ──
  const tbSameKey = new TokenBucket();
  const tbSameStore = new MemoryStore({ maxEntries: 100_000, cleanupInterval: 600_000 });

  bench("Token Bucket (same key)", async () => {
    await tbSameKey.consume("single-key", tbSameStore, options);
  });

  const fwSameKey = new FixedWindow();
  const fwSameStore = new MemoryStore({ maxEntries: 100_000, cleanupInterval: 600_000 });

  bench("Fixed Window (same key)", async () => {
    await fwSameKey.consume("single-key", fwSameStore, options);
  });
});
