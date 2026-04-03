import { describe, expect, it } from "vitest";
import { ConfigError, ErrorCode, StoreError } from "../../../src/core/errors";
import { RateCraft } from "../../../src/core/rate-limiter";
import type { RateLimitRecord, RateLimitStore } from "../../../src/core/types";

describe("RateCraft — Configuration Validation", () => {
  describe("max option", () => {
    it("should reject zero", () => {
      expect(() => new RateCraft({ max: 0, window: "1m" })).toThrow(ConfigError);
      expect(() => new RateCraft({ max: 0, window: "1m" })).toThrow("Invalid 'max' option");
    });

    it("should reject negative values", () => {
      expect(() => new RateCraft({ max: -5, window: "1m" })).toThrow(ConfigError);
    });

    it("should reject float values", () => {
      expect(() => new RateCraft({ max: 1.5, window: "1m" })).toThrow(ConfigError);
      expect(() => new RateCraft({ max: 1.5, window: "1m" })).toThrow("positive integer");
    });

    it("should reject NaN", () => {
      expect(() => new RateCraft({ max: Number.NaN, window: "1m" })).toThrow(ConfigError);
    });

    it("should reject Infinity", () => {
      expect(() => new RateCraft({ max: Number.POSITIVE_INFINITY, window: "1m" })).toThrow(
        ConfigError,
      );
    });

    it("should accept valid positive integers", () => {
      const limiter = new RateCraft({ max: 100, window: "1m" });
      expect(limiter).toBeInstanceOf(RateCraft);
      limiter.shutdown();
    });

    it("should include the received value in the error message", () => {
      expect(() => new RateCraft({ max: -5, window: "1m" })).toThrow("-5");
    });

    it("should use ERR_INVALID_MAX error code", () => {
      try {
        new RateCraft({ max: 0, window: "1m" });
      } catch (err) {
        expect((err as ConfigError).code).toBe(ErrorCode.INVALID_MAX);
      }
    });
  });

  describe("window option", () => {
    it("should reject invalid duration strings", () => {
      expect(() => new RateCraft({ max: 10, window: "abc" })).toThrow(ConfigError);
    });

    it("should reject zero duration", () => {
      expect(() => new RateCraft({ max: 10, window: 0 })).toThrow(ConfigError);
    });

    it("should reject negative duration", () => {
      expect(() => new RateCraft({ max: 10, window: -1000 })).toThrow(ConfigError);
    });

    it("should accept valid duration strings", () => {
      const limiter = new RateCraft({ max: 10, window: "15m" });
      expect(limiter).toBeInstanceOf(RateCraft);
      limiter.shutdown();
    });

    it("should accept valid numeric duration (ms)", () => {
      const limiter = new RateCraft({ max: 10, window: 60000 });
      expect(limiter).toBeInstanceOf(RateCraft);
      limiter.shutdown();
    });
  });

  describe("statusCode option", () => {
    it("should reject statusCode below 100", () => {
      expect(() => new RateCraft({ max: 10, window: "1m", statusCode: 99 })).toThrow(ConfigError);
      expect(() => new RateCraft({ max: 10, window: "1m", statusCode: 99 })).toThrow("statusCode");
    });

    it("should reject statusCode above 599", () => {
      expect(() => new RateCraft({ max: 10, window: "1m", statusCode: 600 })).toThrow(ConfigError);
    });

    it("should reject non-integer statusCode", () => {
      expect(() => new RateCraft({ max: 10, window: "1m", statusCode: 429.5 })).toThrow(
        ConfigError,
      );
    });

    it("should use ERR_INVALID_STATUS_CODE error code", () => {
      try {
        new RateCraft({ max: 10, window: "1m", statusCode: 999 });
      } catch (err) {
        expect((err as ConfigError).code).toBe(ErrorCode.INVALID_STATUS_CODE);
      }
    });

    it("should accept valid status codes", () => {
      const limiter = new RateCraft({ max: 10, window: "1m", statusCode: 503 });
      expect(limiter).toBeInstanceOf(RateCraft);
      limiter.shutdown();
    });

    it("should default to 429 when not specified", () => {
      const limiter = new RateCraft({ max: 10, window: "1m" });
      expect(limiter.getOptions().statusCode).toBe(429);
      limiter.shutdown();
    });
  });

  describe("algorithm option", () => {
    it("should reject unknown algorithms", () => {
      expect(
        () => new RateCraft({ max: 10, window: "1m", algorithm: "fast-bucket" as never }),
      ).toThrow(ConfigError);
      expect(
        () => new RateCraft({ max: 10, window: "1m", algorithm: "fast-bucket" as never }),
      ).toThrow("fast-bucket");
    });

    it("should use ERR_UNKNOWN_ALGORITHM error code", () => {
      try {
        new RateCraft({ max: 10, window: "1m", algorithm: "nope" as never });
      } catch (err) {
        expect((err as ConfigError).code).toBe(ErrorCode.UNKNOWN_ALGORITHM);
      }
    });

    it("should list available algorithms in error message", () => {
      expect(() => new RateCraft({ max: 10, window: "1m", algorithm: "bad" as never })).toThrow(
        "token-bucket",
      );
    });
  });
});

describe("RateCraft — Store Error Wrapping", () => {
  it("should wrap store errors in StoreError", async () => {
    const failingStore: RateLimitStore = {
      get: () => Promise.reject(new Error("connection refused")),
      set: () => Promise.reject(new Error("connection refused")),
      increment: () => Promise.reject(new Error("connection refused")),
      reset: () => Promise.resolve(),
    };

    let capturedError: Error | undefined;
    const limiter = new RateCraft({
      max: 10,
      window: "1m",
      store: failingStore,
      failStrategy: "open",
      hooks: {
        onError: (err) => {
          capturedError = err;
        },
      },
    });

    await limiter.consume("test-key");
    expect(capturedError).toBeInstanceOf(StoreError);
    expect((capturedError as StoreError).storeName).toBe("Object");
    expect((capturedError as StoreError).cause).toBeInstanceOf(Error);
    await limiter.shutdown();
  });

  it("should not double-wrap StoreError", async () => {
    const originalError = new Error("timeout");
    const storeError = new StoreError("already wrapped", "RedisStore", originalError);

    const failingStore: RateLimitStore = {
      get: () => Promise.reject(storeError),
      set: () => Promise.reject(storeError),
      increment: () => Promise.reject(storeError),
      reset: () => Promise.resolve(),
    };

    let capturedError: Error | undefined;
    const limiter = new RateCraft({
      max: 10,
      window: "1m",
      store: failingStore,
      failStrategy: "open",
      hooks: {
        onError: (err) => {
          capturedError = err;
        },
      },
    });

    await limiter.consume("test-key");
    expect(capturedError).toBe(storeError);
    await limiter.shutdown();
  });
});
