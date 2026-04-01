import type {
  AlgorithmOptions,
  RateLimitAlgorithm,
  RateLimitResult,
  RateLimitStore,
} from "../types";

/**
 * Fixed Window algorithm.
 *
 * Time is divided into fixed windows (e.g. every 60 seconds).
 * A counter is maintained per window.
 * When the counter reaches `max`, requests are denied.
 * Counter resets when a new window starts.
 */
export class FixedWindow implements RateLimitAlgorithm {
  async consume(
    key: string,
    store: RateLimitStore,
    options: AlgorithmOptions,
  ): Promise<RateLimitResult> {
    const { max, window } = options;
    const now = Date.now();
    const windowStart = Math.floor(now / window) * window;
    const windowKey = `${key}:${windowStart}`;

    const record = await store.get(windowKey);

    if (record === null) {
      // First request in this window
      await store.set(windowKey, { count: 1, createdAt: windowStart, updatedAt: now }, window);

      const resetAt = windowStart + window;
      return {
        allowed: true,
        remaining: max - 1,
        limit: max,
        resetIn: resetAt - now,
        resetAt,
        retryAfter: 0,
      };
    }

    const resetAt = windowStart + window;
    const resetIn = resetAt - now;

    if (record.count < max) {
      const newCount = await store.increment(windowKey);

      return {
        allowed: true,
        remaining: Math.max(0, max - newCount),
        limit: max,
        resetIn,
        resetAt,
        retryAfter: 0,
      };
    }

    // Window is full — deny
    return {
      allowed: false,
      remaining: 0,
      limit: max,
      resetIn,
      resetAt,
      retryAfter: Math.ceil(resetIn / 1000),
    };
  }
}
