import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SlidingWindowCounter } from "../../../src/core/algorithms/sliding-window-counter";
import type { AlgorithmOptions } from "../../../src/core/types";
import { MemoryStore } from "../../../src/stores/memory";

describe("SlidingWindowCounter", () => {
  let algorithm: SlidingWindowCounter;
  let store: MemoryStore;
  const options: AlgorithmOptions = { max: 10, window: 10_000 };

  beforeEach(() => {
    algorithm = new SlidingWindowCounter();
    store = new MemoryStore({ cleanupInterval: 600_000 });
  });

  afterEach(async () => {
    await store.shutdown();
    vi.useRealTimers();
  });

  it("should allow up to max requests in a single window", async () => {
    vi.useFakeTimers({ now: 100_000 });

    for (let i = 0; i < 10; i++) {
      const result = await algorithm.consume("key", store, options);
      expect(result.allowed).toBe(true);
    }

    const denied = await algorithm.consume("key", store, options);
    expect(denied.allowed).toBe(false);
  });

  it("should calculate weighted average correctly", async () => {
    vi.useFakeTimers({ now: 100_000 });

    // Fill previous window completely (10 requests)
    for (let i = 0; i < 10; i++) {
      await algorithm.consume("key", store, options);
    }

    // Move to the start of the next window
    // At the very start of new window, weight ≈ 1.0
    // estimatedTotal = 10 * ~1.0 + 0 = ~10 → should deny
    vi.setSystemTime(110_000);

    const result = await algorithm.consume("key", store, options);
    expect(result.allowed).toBe(false);
  });

  it("should allow when previous window weight decreases enough", async () => {
    vi.useFakeTimers({ now: 100_000 });

    // Fill previous window with 10 requests
    for (let i = 0; i < 10; i++) {
      await algorithm.consume("key", store, options);
    }

    // Move to 90% into the next window
    // weight = (10000 - 9000) / 10000 = 0.1
    // estimatedTotal = 10 * 0.1 + 0 = 1 → should allow (1 < 10)
    vi.setSystemTime(119_000);

    const result = await algorithm.consume("key", store, options);
    expect(result.allowed).toBe(true);
  });

  it("should return 0 estimated when previous window is empty", async () => {
    vi.useFakeTimers({ now: 100_000 });

    // No previous window data — only current counts
    const result = await algorithm.consume("key", store, options);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it("should provide smooth behavior across window transitions (no boundary spike)", async () => {
    vi.useFakeTimers({ now: 100_000 });

    // Use 8 out of 10 in the first window
    for (let i = 0; i < 8; i++) {
      await algorithm.consume("key", store, options);
    }

    // Move to 50% into the next window
    // weight = 0.5, estimatedTotal = 8 * 0.5 + 0 = 4
    // Should allow up to 6 more (10 - 4 = 6)
    vi.setSystemTime(115_000);

    let allowedCount = 0;
    for (let i = 0; i < 10; i++) {
      const result = await algorithm.consume("key", store, options);
      if (result.allowed) allowedCount++;
    }

    // Should allow approximately 5-6 requests (due to floating point and incremental counting)
    expect(allowedCount).toBeGreaterThanOrEqual(5);
    expect(allowedCount).toBeLessThanOrEqual(6);
  });

  it("should return correct remaining value", async () => {
    vi.useFakeTimers({ now: 100_000 });

    const r1 = await algorithm.consume("key", store, options);
    expect(r1.remaining).toBe(9);

    const r2 = await algorithm.consume("key", store, options);
    expect(r2.remaining).toBe(8);
  });

  it("should return positive retryAfter when denied", async () => {
    vi.useFakeTimers({ now: 100_000 });

    for (let i = 0; i < 10; i++) {
      await algorithm.consume("key", store, options);
    }

    const result = await algorithm.consume("key", store, options);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("should treat different keys independently", async () => {
    vi.useFakeTimers({ now: 100_000 });

    for (let i = 0; i < 10; i++) {
      await algorithm.consume("key-a", store, options);
    }
    const denied = await algorithm.consume("key-a", store, options);
    expect(denied.allowed).toBe(false);

    const resultB = await algorithm.consume("key-b", store, options);
    expect(resultB.allowed).toBe(true);
    expect(resultB.remaining).toBe(9);
  });

  it("should not return negative remaining", async () => {
    vi.useFakeTimers({ now: 100_000 });

    for (let i = 0; i < 10; i++) {
      await algorithm.consume("key", store, options);
    }

    const result = await algorithm.consume("key", store, options);
    expect(result.remaining).toBeGreaterThanOrEqual(0);
  });
});
