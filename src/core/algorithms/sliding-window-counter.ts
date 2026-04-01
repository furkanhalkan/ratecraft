import type {
  AlgorithmOptions,
  RateLimitAlgorithm,
  RateLimitResult,
  RateLimitStore,
} from "../types";

/**
 * Sliding Window Counter algorithm.
 *
 * Maintains two window counters: previous and current.
 * Estimated total = (prevCount * weight) + currentCount
 * where weight = (window - elapsedInCurrentWindow) / window
 *
 * Memory efficient: only 2 counters needed.
 */
export class SlidingWindowCounter implements RateLimitAlgorithm {
  async consume(
    key: string,
    store: RateLimitStore,
    options: AlgorithmOptions,
  ): Promise<RateLimitResult> {
    const { max, window } = options;
    const now = Date.now();
    const currentWindowStart = Math.floor(now / window) * window;
    const previousWindowStart = currentWindowStart - window;

    const currentKey = `${key}:${currentWindowStart}`;
    const previousKey = `${key}:${previousWindowStart}`;

    const [currentRecord, previousRecord] = await Promise.all([
      store.get(currentKey),
      store.get(previousKey),
    ]);

    const prevCount = previousRecord ? previousRecord.count : 0;
    const currCount = currentRecord ? currentRecord.count : 0;

    const elapsed = now - currentWindowStart;
    const weight = (window - elapsed) / window;
    const estimatedTotal = prevCount * weight + currCount;

    if (estimatedTotal < max) {
      if (currentRecord === null) {
        await store.set(
          currentKey,
          { count: 1, createdAt: currentWindowStart, updatedAt: now },
          window * 2,
        );
      } else {
        await store.increment(currentKey);
      }

      const remaining = Math.max(0, Math.floor(max - estimatedTotal - 1));
      const resetIn = window - elapsed;

      return {
        allowed: true,
        remaining,
        limit: max,
        resetIn,
        resetAt: now + resetIn,
        retryAfter: 0,
      };
    }

    // Limit reached — deny
    const resetIn = window - elapsed;

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
