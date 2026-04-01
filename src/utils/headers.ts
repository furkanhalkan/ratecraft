import type { RateLimitResult } from "../core/types";

/**
 * Build rate limit response headers following the
 * IETF draft-ietf-httpapi-ratelimit-headers standard.
 *
 * @param result - The rate limit evaluation result
 * @param legacy - Also include legacy X-RateLimit-* headers
 * @returns Record of header name → value
 */
export function buildRateLimitHeaders(
  result: RateLimitResult,
  legacy = false,
): Record<string, string> {
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(Math.ceil(result.resetIn / 1000)),
  };

  if (!result.allowed) {
    headers["Retry-After"] = String(result.retryAfter);
  }

  if (legacy) {
    headers["X-RateLimit-Limit"] = headers["RateLimit-Limit"] as string;
    headers["X-RateLimit-Remaining"] = headers["RateLimit-Remaining"] as string;
    headers["X-RateLimit-Reset"] = String(result.resetAt);
  }

  return headers;
}
