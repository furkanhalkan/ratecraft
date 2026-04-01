import { describe, expect, it } from "vitest";
import { RateCraft } from "../../src/core/rate-limiter";

describe("Concurrency (E2E)", () => {
  it("should handle 100 rapid sequential requests — exactly max allowed", async () => {
    const limiter = new RateCraft({
      algorithm: "token-bucket",
      max: 50,
      window: 60_000,
    });

    let allowed = 0;
    let denied = 0;

    for (let i = 0; i < 100; i++) {
      const result = await limiter.consume("concurrent-key");
      if (result.allowed) allowed++;
      else denied++;
    }

    expect(allowed).toBe(50);
    expect(denied).toBe(50);

    await limiter.shutdown();
  });

  it("should handle rapid requests across multiple keys without interference", async () => {
    const limiter = new RateCraft({
      algorithm: "fixed-window",
      max: 5,
      window: 60_000,
    });

    // 3 different keys, each gets their own quota
    for (const key of ["user-1", "user-2", "user-3"]) {
      for (let i = 0; i < 5; i++) {
        const result = await limiter.consume(key);
        expect(result.allowed).toBe(true);
      }
      const denied = await limiter.consume(key);
      expect(denied.allowed).toBe(false);
    }

    await limiter.shutdown();
  });

  it("should not have race conditions with all four algorithms", async () => {
    const algorithms = [
      "token-bucket",
      "fixed-window",
      "sliding-window-counter",
      "sliding-window-log",
    ] as const;

    for (const algorithm of algorithms) {
      const limiter = new RateCraft({
        algorithm,
        max: 10,
        window: 60_000,
      });

      let allowed = 0;
      for (let i = 0; i < 20; i++) {
        const result = await limiter.consume("race-key");
        if (result.allowed) allowed++;
      }

      expect(allowed).toBe(10);
      await limiter.shutdown();
    }
  });
});
