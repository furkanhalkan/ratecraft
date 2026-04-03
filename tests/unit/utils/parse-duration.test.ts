import { describe, expect, it } from "vitest";
import { ConfigError } from "../../../src/core/errors";
import { parseDuration } from "../../../src/utils/parse-duration";

describe("parseDuration", () => {
  describe("string inputs", () => {
    it("should parse seconds", () => {
      expect(parseDuration("1s")).toBe(1_000);
      expect(parseDuration("30s")).toBe(30_000);
    });

    it("should parse minutes", () => {
      expect(parseDuration("5m")).toBe(300_000);
      expect(parseDuration("15m")).toBe(900_000);
    });

    it("should parse hours", () => {
      expect(parseDuration("1h")).toBe(3_600_000);
      expect(parseDuration("2h")).toBe(7_200_000);
    });

    it("should parse days", () => {
      expect(parseDuration("1d")).toBe(86_400_000);
      expect(parseDuration("7d")).toBe(604_800_000);
    });
  });

  describe("number inputs", () => {
    it("should return the number directly (ms)", () => {
      expect(parseDuration(1000)).toBe(1000);
      expect(parseDuration(500)).toBe(500);
    });

    it("should throw for zero", () => {
      expect(() => parseDuration(0)).toThrow("Invalid duration");
    });

    it("should throw for negative numbers", () => {
      expect(() => parseDuration(-100)).toThrow("Invalid duration");
    });

    it("should throw for Infinity", () => {
      expect(() => parseDuration(Number.POSITIVE_INFINITY)).toThrow("Invalid duration");
    });

    it("should throw for NaN", () => {
      expect(() => parseDuration(Number.NaN)).toThrow("Invalid duration");
    });
  });

  describe("invalid string inputs", () => {
    it("should throw for empty string", () => {
      expect(() => parseDuration("")).toThrow("Invalid duration format");
    });

    it("should throw for unknown unit", () => {
      expect(() => parseDuration("10x")).toThrow("Invalid duration format");
    });

    it("should throw for missing number", () => {
      expect(() => parseDuration("m")).toThrow("Invalid duration format");
    });

    it("should throw for decimal values", () => {
      expect(() => parseDuration("1.5m")).toThrow("Invalid duration format");
    });

    it("should throw for negative string values", () => {
      expect(() => parseDuration("-5m")).toThrow("Invalid duration format");
    });

    it("should throw for string with spaces", () => {
      expect(() => parseDuration("5 m")).toThrow("Invalid duration format");
    });

    it("should include the invalid input in the error message", () => {
      expect(() => parseDuration("abc")).toThrow('"abc"');
    });

    it("should throw ConfigError instances", () => {
      expect(() => parseDuration("abc")).toThrow(ConfigError);
      expect(() => parseDuration(-1)).toThrow(ConfigError);
    });
  });
});
