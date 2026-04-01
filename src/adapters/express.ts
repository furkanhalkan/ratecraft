import type { NextFunction, Request, Response } from "express";
import type { RateCraft } from "../core/rate-limiter";
import { buildRateLimitHeaders } from "../utils/headers";

/**
 * Express middleware adapter for RateCraft.
 *
 * @param limiter - RateCraft instance
 * @returns Express middleware function
 */
export function expressAdapter(limiter: RateCraft) {
  const options = limiter.getOptions();

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip check
    if (await options.skip(req)) {
      return next();
    }

    const key = options.keyGenerator(req);
    const result = await limiter.consume(key);

    // Set rate limit headers
    if (options.headers) {
      const headers = buildRateLimitHeaders(result, options.legacyHeaders);
      for (const [name, value] of Object.entries(headers)) {
        res.setHeader(name, value);
      }
    }

    if (result.allowed) {
      return next();
    }

    // Rate limited
    options.onRateLimited(req, result);
    res.status(options.statusCode).json(options.message);
  };
}
