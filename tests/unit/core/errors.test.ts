import { describe, expect, it } from "vitest";
import { ConfigError, RateCraftError, StoreError } from "../../../src/core/errors";

describe("Error Classes", () => {
  describe("RateCraftError", () => {
    it("should set name, message, and code", () => {
      const err = new RateCraftError("test message", "TEST_CODE");
      expect(err.name).toBe("RateCraftError");
      expect(err.message).toBe("test message");
      expect(err.code).toBe("TEST_CODE");
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe("StoreError", () => {
    it("should set name, message, code, and originalError", () => {
      const original = new Error("connection refused");
      const err = new StoreError("Store unavailable", original);
      expect(err.name).toBe("StoreError");
      expect(err.message).toBe("Store unavailable");
      expect(err.code).toBe("STORE_ERROR");
      expect(err.originalError).toBe(original);
      expect(err).toBeInstanceOf(RateCraftError);
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe("ConfigError", () => {
    it("should set name, message, and code", () => {
      const err = new ConfigError("Invalid max value");
      expect(err.name).toBe("ConfigError");
      expect(err.message).toBe("Invalid max value");
      expect(err.code).toBe("CONFIG_ERROR");
      expect(err).toBeInstanceOf(RateCraftError);
      expect(err).toBeInstanceOf(Error);
    });
  });
});
