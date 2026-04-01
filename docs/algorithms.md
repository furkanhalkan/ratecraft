# Algorithms

RateCraft ships with four rate-limiting algorithms. Each has different trade-offs in accuracy, memory usage, and burst handling. Choose the one that best fits your use case.

## Token Bucket

**Type:** `'token-bucket'` (default)

### How it works

1. Each key has a "bucket" that starts filled with `max` tokens.
2. Every request consumes one token.
3. Tokens refill at a constant rate of `max / window` tokens per millisecond.
4. The bucket capacity never exceeds `max`.
5. Burst traffic is allowed — accumulated tokens can be spent all at once.

### Characteristics

| Property | Value |
|----------|-------|
| Burst handling | Allows bursts up to `max` |
| Accuracy | Good |
| Memory per key | O(1) — single counter |
| Best for | APIs that should tolerate short bursts |

### Example

```typescript
const limiter = new RateCraft({
  algorithm: 'token-bucket',
  max: 100,
  window: '1m',
});
```

A client can send 100 requests instantly (burst), then must wait for tokens to refill. After 30 seconds of inactivity, 50 tokens will have accumulated.

---

## Fixed Window

**Type:** `'fixed-window'`

### How it works

1. Time is divided into fixed windows (e.g., every 60 seconds).
2. A counter tracks requests per window.
3. When the counter reaches `max`, subsequent requests are denied.
4. The counter resets when a new window begins.

### Characteristics

| Property | Value |
|----------|-------|
| Burst handling | Up to 2x at window boundaries |
| Accuracy | Moderate |
| Memory per key | O(1) — single counter |
| Best for | Simple, predictable rate limiting |

### Known limitation: boundary spike

At the boundary between two windows, a client can potentially send up to 2x the configured limit within a short timeframe. For example, with `max: 100` and `window: '1m'`:

- 100 requests at 11:59:50 (end of window 1)
- 100 requests at 12:00:05 (start of window 2)
- Result: 200 requests within 15 seconds

If this is unacceptable for your use case, use **Sliding Window Counter** or **Sliding Window Log** instead.

### Example

```typescript
const limiter = new RateCraft({
  algorithm: 'fixed-window',
  max: 100,
  window: '1m',
});
```

---

## Sliding Window Counter

**Type:** `'sliding-window-counter'`

### How it works

1. Two counters are maintained: one for the previous window and one for the current window.
2. The estimated total is calculated as: `(previousCount * weight) + currentCount`
3. The weight decreases linearly: `weight = (window - elapsedInCurrentWindow) / window`
4. This approximation smooths out the boundary spike problem of fixed windows.

### Characteristics

| Property | Value |
|----------|-------|
| Burst handling | Smoothed across windows |
| Accuracy | High (approximation) |
| Memory per key | O(1) — two counters |
| Best for | Balanced accuracy and performance |

### Example

```typescript
const limiter = new RateCraft({
  algorithm: 'sliding-window-counter',
  max: 100,
  window: '1m',
});
```

At 30 seconds into the current window, if the previous window had 80 requests and the current window has 20:

```
weight = (60000 - 30000) / 60000 = 0.5
estimatedTotal = (80 * 0.5) + 20 = 60
remaining = 100 - 60 = 40
```

---

## Sliding Window Log

**Type:** `'sliding-window-log'`

### How it works

1. Every request's timestamp is stored in a log.
2. Timestamps outside the current window are discarded on each request.
3. If the number of timestamps in the window exceeds `max`, the request is denied.
4. This is the most accurate algorithm but uses the most memory.

### Characteristics

| Property | Value |
|----------|-------|
| Burst handling | Exact enforcement |
| Accuracy | Highest (exact) |
| Memory per key | O(n) — one entry per request |
| Best for | Maximum precision, lower-traffic endpoints |

### Memory warning

Memory usage scales linearly with the number of requests per key. For high-traffic APIs (thousands of requests per key per window), prefer **Sliding Window Counter** instead.

When using Redis, the log is stored as a sorted set (ZSET), which provides efficient range queries for cleanup.

### Example

```typescript
const limiter = new RateCraft({
  algorithm: 'sliding-window-log',
  max: 10,
  window: '1m',
});
```

---

## Comparison

| Algorithm | Burst | Accuracy | Memory | Performance |
|-----------|-------|----------|--------|-------------|
| Token Bucket | Allowed | Good | O(1) | Fastest (same key) |
| Fixed Window | 2x at boundary | Moderate | O(1) | Fast |
| Sliding Window Counter | Smoothed | High | O(1) | Fast |
| Sliding Window Log | None | Exact | O(n) | Moderate |

## Choosing an algorithm

- **Token Bucket** — Default choice. Good for most APIs. Allows natural burst patterns.
- **Fixed Window** — Simplest to reason about. Use when boundary spikes are acceptable.
- **Sliding Window Counter** — Best balance of accuracy and efficiency. Recommended when boundary spikes are not acceptable.
- **Sliding Window Log** — Use when you need exact enforcement and traffic volume is manageable.
