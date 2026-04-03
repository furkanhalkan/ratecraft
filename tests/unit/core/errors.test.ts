import { describe, expect, it } from "vitest";
import { ConfigError, ErrorCode, RateCraftError, StoreError } from "../../../src/core/errors";

describe("Error Classes", () => {
  describe("RateCraftError", () => {
    it("should set name, message, and code", () => {
      const err = new RateCraftError("test message", "TEST_CODE");
      expect(err.name).toBe("RateCraftError");
      expect(err.message).toBe("[RateCraft] test message");
      expect(err.code).toBe("TEST_CODE");
      expect(err).toBeInstanceOf(Error);
    });

    it("should support error cause chaining", () => {
      const cause = new Error("root cause");
      const err = new RateCraftError("wrapped", "TEST_CODE", { cause });
      expect(err.cause).toBe(cause);
    });
  });

  describe("StoreError", () => {
    it("should set name, message, code, storeName, and originalError", () => {
      const original = new Error("connection refused");
      const err = new StoreError("get operation failed", "RedisStore", original);
      expect(err.name).toBe("StoreError");
      expect(err.message).toBe("[RateCraft] RedisStore store error: get operation failed");
      expect(err.code).toBe(ErrorCode.STORE_ERROR);
      expect(err.storeName).toBe("RedisStore");
      expect(err.originalError).toBe(original);
      expect(err.cause).toBe(original);
      expect(err).toBeInstanceOf(RateCraftError);
      expect(err).toBeInstanceOf(Error);
    });

    it("should accept a specific error code", () => {
      const original = new Error("timeout");
      const err = new StoreError(
        "connection timed out",
        "MemcachedStore",
        original,
        ErrorCode.STORE_CONNECTION,
      );
      expect(err.code).toBe(ErrorCode.STORE_CONNECTION);
      expect(err.storeName).toBe("MemcachedStore");
    });
  });

  describe("ConfigError", () => {
    it("should set name, message, and code", () => {
      const err = new ConfigError("Invalid max value", ErrorCode.INVALID_MAX);
      expect(err.name).toBe("ConfigError");
      expect(err.message).toBe("[RateCraft] Invalid max value");
      expect(err.code).toBe(ErrorCode.INVALID_MAX);
      expect(err).toBeInstanceOf(RateCraftError);
      expect(err).toBeInstanceOf(Error);
    });

    it("should use default code when not specified", () => {
      const err = new ConfigError("some error");
      expect(err.code).toBe(ErrorCode.INVALID_MAX);
    });
  });

  describe("ErrorCode", () => {
    it("should expose all expected error codes", () => {
      expect(ErrorCode.INVALID_MAX).toBe("ERR_INVALID_MAX");
      expect(ErrorCode.INVALID_WINDOW).toBe("ERR_INVALID_WINDOW");
      expect(ErrorCode.INVALID_DURATION).toBe("ERR_INVALID_DURATION");
      expect(ErrorCode.INVALID_STATUS_CODE).toBe("ERR_INVALID_STATUS_CODE");
      expect(ErrorCode.UNKNOWN_ALGORITHM).toBe("ERR_UNKNOWN_ALGORITHM");
      expect(ErrorCode.STORE_ERROR).toBe("ERR_STORE");
      expect(ErrorCode.STORE_GET_FAILED).toBe("ERR_STORE_GET_FAILED");
      expect(ErrorCode.STORE_SET_FAILED).toBe("ERR_STORE_SET_FAILED");
      expect(ErrorCode.STORE_INCREMENT_FAILED).toBe("ERR_STORE_INCREMENT_FAILED");
      expect(ErrorCode.STORE_CONNECTION).toBe("ERR_STORE_CONNECTION");
      expect(ErrorCode.STORE_PARSE).toBe("ERR_STORE_PARSE");
    });
  });
});
