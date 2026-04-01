import type { MiddlewareHandler } from "hono";
import type { RateCraft } from "../core/rate-limiter";
import { buildRateLimitHeaders } from "../utils/headers";

/**
 * Hono middleware adapter for RateCraft.
 *
 * @param limiter - RateCraft instance
 * @returns Hono middleware handler
 */
export function honoAdapter(limiter: RateCraft): MiddlewareHandler {
  const options = limiter.getOptions();

  return async (c, next) => {
    // Skip check
    if (await options.skip(c.req.raw)) {
      return next();
    }

    const key = options.keyGenerator(c.req.raw);
    const result = await limiter.consume(key);

    // Set rate limit headers
    if (options.headers) {
      const headers = buildRateLimitHeaders(result, options.legacyHeaders);
      for (const [name, value] of Object.entries(headers)) {
        c.header(name, value);
      }
    }

    if (result.allowed) {
      return next();
    }

    options.onRateLimited(c.req.raw, result);
    return c.json(options.message, options.statusCode as 429);
  };
}
