import type {
  AlgorithmOptions,
  RateLimitAlgorithm,
  RateLimitResult,
  RateLimitStore,
} from "../types";

/**
 * Sliding Window Log algorithm.
 *
 * Each request's timestamp is added to a log.
 * Old timestamps outside the window are cleaned up.
 * If the log size exceeds `max`, the request is denied.
 *
 * Most accurate algorithm but uses the most memory — O(n)
 * where n is the number of requests in the window.
 */
export class SlidingWindowLog implements RateLimitAlgorithm {
  async consume(
    key: string,
    store: RateLimitStore,
    options: AlgorithmOptions,
  ): Promise<RateLimitResult> {
    const { max, window } = options;
    const now = Date.now();
    const windowStart = now - window;

    const record = await store.get(key);
    const rawTimestamps = record?.metadata?.timestamps;
    let timestamps: number[] = Array.isArray(rawTimestamps) ? (rawTimestamps as number[]) : [];

    // Clean up old entries outside the window
    timestamps = timestamps.filter((t) => t > windowStart);

    if (timestamps.length < max) {
      timestamps.push(now);

      await store.set(
        key,
        {
          count: timestamps.length,
          createdAt: record?.createdAt ?? now,
          updatedAt: now,
          metadata: { timestamps },
        },
        window,
      );

      return {
        allowed: true,
        remaining: max - timestamps.length,
        limit: max,
        resetIn: window,
        resetAt: now + window,
        retryAfter: 0,
      };
    }

    // Log is full — deny
    const oldestInWindow = timestamps[0] as number;
    const resetIn = Math.max(0, oldestInWindow + window - now);

    return {
      allowed: false,
      remaining: 0,
      limit: max,
      resetIn,
      resetAt: now + resetIn,
      retryAfter: Math.ceil(resetIn / 1000),
    };
  }
}
