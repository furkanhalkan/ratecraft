import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FixedWindow } from "../../../src/core/algorithms/fixed-window";
import type { AlgorithmOptions } from "../../../src/core/types";
import { MemoryStore } from "../../../src/stores/memory";

describe("FixedWindow", () => {
  let algorithm: FixedWindow;
  let store: MemoryStore;
  const options: AlgorithmOptions = { max: 5, window: 10_000 };

  beforeEach(() => {
    algorithm = new FixedWindow();
    store = new MemoryStore({ cleanupInterval: 600_000 });
  });

  afterEach(async () => {
    await store.shutdown();
  });

  it("should allow requests within the window limit", async () => {
    for (let i = 0; i < 5; i++) {
      const result = await algorithm.consume("key", store, options);
      expect(result.allowed).toBe(true);
    }
  });

  it("should deny requests when the window is full", async () => {
    for (let i = 0; i < 5; i++) {
      await algorithm.consume("key", store, options);
    }

    const result = await algorithm.consume("key", store, options);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("should reset the counter in a new window", async () => {
    vi.useFakeTimers();

    // Fill the current window
    for (let i = 0; i < 5; i++) {
      await algorithm.consume("key", store, options);
    }

    // Denied
    let result = await algorithm.consume("key", store, options);
    expect(result.allowed).toBe(false);

    // Advance to the next window
    vi.advanceTimersByTime(10_000);

    // Should be allowed again
    result = await algorithm.consume("key", store, options);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);

    vi.useRealTimers();
  });

  it("should return correct resetAt pointing to window end", async () => {
    vi.useFakeTimers({ now: 100_000 }); // Start at a known time

    const result = await algorithm.consume("key", store, options);

    // windowStart = floor(100000 / 10000) * 10000 = 100000
    // resetAt = 100000 + 10000 = 110000
    expect(result.resetAt).toBe(110_000);

    vi.useRealTimers();
  });

  it("should treat different keys independently", async () => {
    // Fill key-a
    for (let i = 0; i < 5; i++) {
      await algorithm.consume("key-a", store, options);
    }
    const deniedA = await algorithm.consume("key-a", store, options);
    expect(deniedA.allowed).toBe(false);

    // key-b is independent
    const resultB = await algorithm.consume("key-b", store, options);
    expect(resultB.allowed).toBe(true);
    expect(resultB.remaining).toBe(4);
  });

  it("should decrement remaining correctly", async () => {
    const r1 = await algorithm.consume("key", store, options);
    expect(r1.remaining).toBe(4);

    const r2 = await algorithm.consume("key", store, options);
    expect(r2.remaining).toBe(3);

    const r3 = await algorithm.consume("key", store, options);
    expect(r3.remaining).toBe(2);
  });

  it("should return positive retryAfter when denied", async () => {
    for (let i = 0; i < 5; i++) {
      await algorithm.consume("key", store, options);
    }

    const result = await algorithm.consume("key", store, options);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("should return correct resetIn (time until window end)", async () => {
    vi.useFakeTimers({ now: 103_000 }); // 3s into a 10s window

    const result = await algorithm.consume("key", store, options);

    // windowStart = floor(103000 / 10000) * 10000 = 100000
    // resetAt = 110000
    // resetIn = 110000 - 103000 = 7000
    expect(result.resetIn).toBe(7_000);

    vi.useRealTimers();
  });

  it("should handle limit of 1", async () => {
    const opts: AlgorithmOptions = { max: 1, window: 10_000 };

    const r1 = await algorithm.consume("key", store, opts);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(0);

    const r2 = await algorithm.consume("key", store, opts);
    expect(r2.allowed).toBe(false);
  });

  it("should handle rapid sequential requests correctly", async () => {
    // Verify that rapid sequential calls respect the limit
    for (let i = 0; i < 5; i++) {
      const result = await algorithm.consume("key", store, options);
      expect(result.allowed).toBe(true);
    }

    // 6th should be denied
    const denied = await algorithm.consume("key", store, options);
    expect(denied.allowed).toBe(false);
  });
});
