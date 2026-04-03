import type { H3Event } from "h3";
import { createError, getRequestIP, setResponseHeader } from "h3";
import type { RateCraft } from "../core/rate-limiter";
import { buildRateLimitHeaders } from "../utils/headers";

/**
 * H3/Nitro event handler adapter for RateCraft.
 *
 * Works with H3, Nitro, and Nuxt server routes.
 *
 * @param limiter - RateCraft instance
 * @returns H3 event handler that acts as middleware
 */
export function h3Adapter(limiter: RateCraft) {
  const options = limiter.getOptions();

  return async (event: H3Event) => {
    // Skip check
    if (await options.skip(event)) {
      return;
    }

    const key = options.keyGenerator(event);
    const result = await limiter.consume(key);

    // Set rate limit headers
    if (options.headers) {
      const headers = buildRateLimitHeaders(result, options.legacyHeaders);
      for (const [name, value] of Object.entries(headers)) {
        setResponseHeader(event, name, value);
      }
    }

    if (!result.allowed) {
      options.onRateLimited(event, result);

      // Include rate limit headers in the error response so they survive
      // H3's error handling (which replaces the original response).
      const errorHeaders: Record<string, string> = {};
      if (options.headers) {
        const rateLimitHeaders = buildRateLimitHeaders(result, options.legacyHeaders);
        Object.assign(errorHeaders, rateLimitHeaders);
      }

      throw createError({
        statusCode: options.statusCode,
        statusMessage: "Too Many Requests",
        data: options.message,
        headers: errorHeaders,
      });
    }
  };
}

/**
 * Default key generator for H3 — extracts client IP from the event.
 */
export function h3KeyGenerator(event: H3Event): string {
  return getRequestIP(event, { xForwardedFor: true }) ?? "unknown";
}
