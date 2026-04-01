import { describe, expect, it } from "vitest";
import type { RateLimitResult } from "../../../src/core/types";
import { buildRateLimitHeaders } from "../../../src/utils/headers";

describe("buildRateLimitHeaders", () => {
  const allowedResult: RateLimitResult = {
    allowed: true,
    remaining: 95,
    limit: 100,
    resetIn: 45_000,
    resetAt: Date.now() + 45_000,
    retryAfter: 0,
  };

  const deniedResult: RateLimitResult = {
    allowed: false,
    remaining: 0,
    limit: 100,
    resetIn: 30_000,
    resetAt: Date.now() + 30_000,
    retryAfter: 30,
  };

  describe("standard headers", () => {
    it("should include RateLimit-Limit", () => {
      const headers = buildRateLimitHeaders(allowedResult);
      expect(headers["RateLimit-Limit"]).toBe("100");
    });

    it("should include RateLimit-Remaining", () => {
      const headers = buildRateLimitHeaders(allowedResult);
      expect(headers["RateLimit-Remaining"]).toBe("95");
    });

    it("should include RateLimit-Reset in seconds (ceil)", () => {
      const headers = buildRateLimitHeaders(allowedResult);
      expect(headers["RateLimit-Reset"]).toBe("45");
    });

    it("should ceil RateLimit-Reset for non-even milliseconds", () => {
      const result: RateLimitResult = {
        ...allowedResult,
        resetIn: 45_100,
      };
      const headers = buildRateLimitHeaders(result);
      expect(headers["RateLimit-Reset"]).toBe("46");
    });
  });

  describe("Retry-After header", () => {
    it("should NOT include Retry-After when allowed", () => {
      const headers = buildRateLimitHeaders(allowedResult);
      expect(headers["Retry-After"]).toBeUndefined();
    });

    it("should include Retry-After when denied", () => {
      const headers = buildRateLimitHeaders(deniedResult);
      expect(headers["Retry-After"]).toBe("30");
    });
  });

  describe("legacy headers", () => {
    it("should NOT include legacy headers by default", () => {
      const headers = buildRateLimitHeaders(allowedResult);
      expect(headers["X-RateLimit-Limit"]).toBeUndefined();
      expect(headers["X-RateLimit-Remaining"]).toBeUndefined();
      expect(headers["X-RateLimit-Reset"]).toBeUndefined();
    });

    it("should NOT include legacy headers when legacy=false", () => {
      const headers = buildRateLimitHeaders(allowedResult, false);
      expect(headers["X-RateLimit-Limit"]).toBeUndefined();
    });

    it("should include legacy headers when legacy=true", () => {
      const headers = buildRateLimitHeaders(allowedResult, true);
      expect(headers["X-RateLimit-Limit"]).toBe("100");
      expect(headers["X-RateLimit-Remaining"]).toBe("95");
      expect(headers["X-RateLimit-Reset"]).toBe(String(allowedResult.resetAt));
    });

    it("should include both standard and legacy headers when legacy=true", () => {
      const headers = buildRateLimitHeaders(deniedResult, true);
      expect(headers["RateLimit-Limit"]).toBe("100");
      expect(headers["X-RateLimit-Limit"]).toBe("100");
      expect(headers["Retry-After"]).toBe("30");
    });
  });
});
