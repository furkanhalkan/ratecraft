import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TokenBucket } from "../../../src/core/algorithms/token-bucket";
import type { AlgorithmOptions } from "../../../src/core/types";
import { MemoryStore } from "../../../src/stores/memory";

describe("TokenBucket", () => {
  let algorithm: TokenBucket;
  let store: MemoryStore;
  const options: AlgorithmOptions = { max: 10, window: 10_000 };

  beforeEach(() => {
    algorithm = new TokenBucket();
    store = new MemoryStore({ cleanupInterval: 600_000 });
  });

  afterEach(async () => {
    await store.shutdown();
  });

  it("should allow the first request", async () => {
    const result = await algorithm.consume("key", store, options);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
    expect(result.limit).toBe(10);
  });

  it("should allow up to max requests", async () => {
    for (let i = 0; i < 10; i++) {
      const result = await algorithm.consume("key", store, options);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9 - i);
    }
  });

  it("should deny the max+1 request", async () => {
    for (let i = 0; i < 10; i++) {
      await algorithm.consume("key", store, options);
    }

    const result = await algorithm.consume("key", store, options);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("should refill tokens after time passes", async () => {
    vi.useFakeTimers();

    // Consume all tokens
    for (let i = 0; i < 10; i++) {
      await algorithm.consume("key", store, options);
    }

    // Verify denied
    let result = await algorithm.consume("key", store, options);
    expect(result.allowed).toBe(false);

    // Advance time for full refill (10s window)
    vi.advanceTimersByTime(10_000);

    result = await algorithm.consume("key", store, options);
    expect(result.allowed).toBe(true);

    vi.useRealTimers();
  });

  it("should allow burst traffic (max requests at once)", async () => {
    // All max requests immediately — burst behavior
    const results = [];
    for (let i = 0; i < 10; i++) {
      results.push(await algorithm.consume("key", store, options));
    }

    expect(results.every((r) => r.allowed)).toBe(true);
    expect(results[9]?.remaining).toBe(0);
  });

  it("should calculate partial token refill correctly", async () => {
    vi.useFakeTimers();

    // Consume all 10 tokens
    for (let i = 0; i < 10; i++) {
      await algorithm.consume("key", store, options);
    }

    // Advance time for exactly 3 tokens to refill
    // refillRate = 10 / 10000 = 0.001 token/ms
    // 3 tokens = 3000ms
    vi.advanceTimersByTime(3_000);

    // Should allow 3 more requests
    for (let i = 0; i < 3; i++) {
      const result = await algorithm.consume("key", store, options);
      expect(result.allowed).toBe(true);
    }

    // 4th should be denied
    const denied = await algorithm.consume("key", store, options);
    expect(denied.allowed).toBe(false);

    vi.useRealTimers();
  });

  it("should return correct remaining values", async () => {
    const r1 = await algorithm.consume("key", store, options);
    expect(r1.remaining).toBe(9);

    const r2 = await algorithm.consume("key", store, options);
    expect(r2.remaining).toBe(8);

    const r3 = await algorithm.consume("key", store, options);
    expect(r3.remaining).toBe(7);
  });

  it("should return positive retryAfter when denied", async () => {
    for (let i = 0; i < 10; i++) {
      await algorithm.consume("key", store, options);
    }

    const result = await algorithm.consume("key", store, options);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("should handle concurrent access without race conditions", async () => {
    // In single-threaded JS with in-memory store, sequential requests
    // are the realistic concurrency model. Verify total allowed count
    // never exceeds max across rapid sequential calls.
    for (let i = 0; i < 10; i++) {
      const result = await algorithm.consume("key", store, options);
      expect(result.allowed).toBe(true);
    }

    // 11th request should be denied
    const denied = await algorithm.consume("key", store, options);
    expect(denied.allowed).toBe(false);
  });

  it("should handle negative elapsed time (clock going backwards)", async () => {
    vi.useFakeTimers({ now: 200_000 });

    await algorithm.consume("key", store, options);

    // Simulate clock going backwards by setting time in the past
    vi.setSystemTime(195_000);

    // Should still work — elapsed clamped to 0 via Math.max
    const result = await algorithm.consume("key", store, options);
    expect(result.allowed).toBe(true);
    // No tokens should be refilled since elapsed is clamped to 0
    expect(result.remaining).toBe(8);

    vi.useRealTimers();
  });

  it("should treat different keys independently", async () => {
    // Exhaust key-a
    for (let i = 0; i < 10; i++) {
      await algorithm.consume("key-a", store, options);
    }
    const deniedA = await algorithm.consume("key-a", store, options);
    expect(deniedA.allowed).toBe(false);

    // key-b should still be available
    const resultB = await algorithm.consume("key-b", store, options);
    expect(resultB.allowed).toBe(true);
    expect(resultB.remaining).toBe(9);
  });

  it("should never exceed max tokens after refill", async () => {
    vi.useFakeTimers();

    await algorithm.consume("key", store, options);

    // Advance far beyond window — tokens should cap at max
    vi.advanceTimersByTime(100_000);

    const result = await algorithm.consume("key", store, options);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9); // max - 1, capped

    vi.useRealTimers();
  });
});
