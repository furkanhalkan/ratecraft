import type {
  AlgorithmOptions,
  RateLimitAlgorithm,
  RateLimitResult,
  RateLimitStore,
} from "../types";

/**
 * Token Bucket algorithm.
 *
 * Each key has a "bucket" that starts with `max` tokens.
 * Each request consumes 1 token. Tokens refill at a constant
 * rate of `max / window` tokens per ms.
 * Bucket capacity never exceeds `max`.
 * Allows burst traffic — accumulated tokens can be spent at once.
 */
export class TokenBucket implements RateLimitAlgorithm {
  async consume(
    key: string,
    store: RateLimitStore,
    options: AlgorithmOptions,
  ): Promise<RateLimitResult> {
    const { max, window } = options;
    const now = Date.now();
    const record = await store.get(key);

    if (record === null) {
      // First request: create a full bucket, consume 1 token
      await store.set(key, { count: max - 1, createdAt: now, updatedAt: now }, window);

      return {
        allowed: true,
        remaining: max - 1,
        limit: max,
        resetIn: window,
        resetAt: now + window,
        retryAfter: 0,
      };
    }

    // Calculate token refill
    const elapsed = Math.max(0, now - record.updatedAt);
    const refillRate = max / window; // tokens per ms
    const tokensToAdd = elapsed * refillRate;
    let currentTokens = Math.min(max, record.count + tokensToAdd);

    if (currentTokens >= 1) {
      currentTokens -= 1;

      await store.set(
        key,
        {
          count: currentTokens,
          createdAt: record.createdAt,
          updatedAt: now,
        },
        window,
      );

      return {
        allowed: true,
        remaining: Math.floor(currentTokens),
        limit: max,
        resetIn: window,
        resetAt: now + window,
        retryAfter: 0,
      };
    }

    // No tokens available — deny
    // Update the record so refill calculation stays accurate
    await store.set(
      key,
      {
        count: currentTokens,
        createdAt: record.createdAt,
        updatedAt: now,
      },
      window,
    );

    const retryAfterMs = Math.ceil((1 - currentTokens) / refillRate);

    return {
      allowed: false,
      remaining: 0,
      limit: max,
      resetIn: retryAfterMs,
      resetAt: now + retryAfterMs,
      retryAfter: Math.ceil(retryAfterMs / 1000),
    };
  }
}
