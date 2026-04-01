import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SlidingWindowLog } from "../../../src/core/algorithms/sliding-window-log";
import type { AlgorithmOptions } from "../../../src/core/types";
import { MemoryStore } from "../../../src/stores/memory";

describe("SlidingWindowLog", () => {
  let algorithm: SlidingWindowLog;
  let store: MemoryStore;
  const options: AlgorithmOptions = { max: 5, window: 10_000 };

  beforeEach(() => {
    algorithm = new SlidingWindowLog();
    store = new MemoryStore({ cleanupInterval: 600_000 });
  });

  afterEach(async () => {
    await store.shutdown();
    vi.useRealTimers();
  });

  it("should allow up to max requests", async () => {
    for (let i = 0; i < 5; i++) {
      const result = await algorithm.consume("key", store, options);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4 - i);
    }
  });

  it("should deny when max is exceeded", async () => {
    for (let i = 0; i < 5; i++) {
      await algorithm.consume("key", store, options);
    }

    const result = await algorithm.consume("key", store, options);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("should automatically clean up old timestamps", async () => {
    vi.useFakeTimers({ now: 100_000 });

    // Fill the window
    for (let i = 0; i < 5; i++) {
      await algorithm.consume("key", store, options);
    }

    // Denied
    let result = await algorithm.consume("key", store, options);
    expect(result.allowed).toBe(false);

    // Move past the window — all old timestamps should be cleaned
    vi.setSystemTime(111_000);

    result = await algorithm.consume("key", store, options);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("should free up space as the window slides", async () => {
    vi.useFakeTimers({ now: 100_000 });

    // Add 3 requests at t=100000
    for (let i = 0; i < 3; i++) {
      await algorithm.consume("key", store, options);
    }

    // Add 2 more at t=105000
    vi.setSystemTime(105_000);
    for (let i = 0; i < 2; i++) {
      await algorithm.consume("key", store, options);
    }

    // Window is full (5 requests)
    let result = await algorithm.consume("key", store, options);
    expect(result.allowed).toBe(false);

    // Advance past the first 3 timestamps (t=100000 + 10000 = 110000)
    vi.setSystemTime(110_001);

    // The 3 earliest timestamps are now outside the window
    // Only 2 remain from t=105000
    result = await algorithm.consume("key", store, options);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2); // 5 - (2 old + 1 new) = 2
  });

  it("should behave correctly at exact window boundary", async () => {
    vi.useFakeTimers({ now: 100_000 });

    // Fill with 5 requests
    for (let i = 0; i < 5; i++) {
      await algorithm.consume("key", store, options);
    }

    // Move to exactly windowStart + window (boundary)
    // filter: t > windowStart, so timestamps at exactly windowStart are excluded
    vi.setSystemTime(110_000);

    const result = await algorithm.consume("key", store, options);
    expect(result.allowed).toBe(true);
  });

  it("should return positive retryAfter when denied", async () => {
    vi.useFakeTimers({ now: 100_000 });

    for (let i = 0; i < 5; i++) {
      await algorithm.consume("key", store, options);
    }

    const result = await algorithm.consume("key", store, options);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("should treat different keys independently", async () => {
    for (let i = 0; i < 5; i++) {
      await algorithm.consume("key-a", store, options);
    }
    const denied = await algorithm.consume("key-a", store, options);
    expect(denied.allowed).toBe(false);

    const resultB = await algorithm.consume("key-b", store, options);
    expect(resultB.allowed).toBe(true);
    expect(resultB.remaining).toBe(4);
  });

  it("should store timestamps as metadata", async () => {
    await algorithm.consume("key", store, options);
    await algorithm.consume("key", store, options);

    const record = await store.get("key");
    expect(record).not.toBeNull();
    expect(record?.metadata).toBeDefined();
    expect(Array.isArray(record?.metadata?.timestamps)).toBe(true);
    expect((record?.metadata?.timestamps as number[]).length).toBe(2);
  });

  it("should handle limit of 1", async () => {
    const opts: AlgorithmOptions = { max: 1, window: 10_000 };

    const r1 = await algorithm.consume("key", store, opts);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(0);

    const r2 = await algorithm.consume("key", store, opts);
    expect(r2.allowed).toBe(false);
  });
});
