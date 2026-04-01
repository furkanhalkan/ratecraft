import { describe, expect, it } from "vitest";
import { MemoryStore, RateCraft } from "../../src";

describe("Distributed (E2E)", () => {
  it("should support failStrategy 'open' — allow when store fails", async () => {
    // Create a store that always throws
    const failingStore: MemoryStore & { get: () => never } = {
      ...new MemoryStore(),
      get: () => {
        throw new Error("Store unavailable");
      },
      set: () => {
        throw new Error("Store unavailable");
      },
      increment: () => {
        throw new Error("Store unavailable");
      },
    } as unknown as MemoryStore & { get: () => never };

    const limiter = new RateCraft({
      max: 10,
      window: "1m",
      store: failingStore,
      failStrategy: "open",
    });

    const result = await limiter.consume("key");
    expect(result.allowed).toBe(true);

    await limiter.shutdown();
  });

  it("should support failStrategy 'closed' — deny when store fails", async () => {
    const failingStore = {
      get: () => {
        throw new Error("Store unavailable");
      },
      set: () => {
        throw new Error("Store unavailable");
      },
      increment: () => {
        throw new Error("Store unavailable");
      },
      reset: async () => {},
    };

    const limiter = new RateCraft({
      max: 10,
      window: "1m",
      store: failingStore as unknown as import("../../src").RateLimitStore,
      failStrategy: "closed",
    });

    const result = await limiter.consume("key");
    expect(result.allowed).toBe(false);

    await limiter.shutdown();
  });

  it("should fall back to fallbackStore when primary fails", async () => {
    let fallbackCalled = false;
    const failingStore = {
      get: () => {
        throw new Error("Primary down");
      },
      set: () => {
        throw new Error("Primary down");
      },
      increment: () => {
        throw new Error("Primary down");
      },
      reset: async () => {},
    };

    const limiter = new RateCraft({
      max: 10,
      window: "1m",
      store: failingStore as unknown as import("../../src").RateLimitStore,
      fallbackStore: new MemoryStore(),
      hooks: {
        onFallback: () => {
          fallbackCalled = true;
        },
      },
    });

    const result = await limiter.consume("key");
    expect(result.allowed).toBe(true);
    expect(fallbackCalled).toBe(true);

    await limiter.shutdown();
  });

  it("should simulate two instances sharing MemoryStore", async () => {
    const sharedStore = new MemoryStore();

    const instance1 = new RateCraft({
      max: 10,
      window: "1m",
      store: sharedStore,
    });

    const instance2 = new RateCraft({
      max: 10,
      window: "1m",
      store: sharedStore,
    });

    // Both instances share the same store
    for (let i = 0; i < 5; i++) {
      await instance1.consume("shared-key");
    }
    for (let i = 0; i < 5; i++) {
      await instance2.consume("shared-key");
    }

    // 11th request from either instance should be denied
    const result = await instance1.consume("shared-key");
    expect(result.allowed).toBe(false);

    await instance1.shutdown();
  });
});
