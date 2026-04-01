# Migration Guide

## Migrating from `express-rate-limit`

### Before (express-rate-limit)

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests',
});

app.use(limiter);
```

### After (RateCraft)

```typescript
import { RateCraft } from 'ratecraft';
import { expressAdapter } from 'ratecraft/express';

const limiter = new RateCraft({
  max: 100,
  window: '15m',           // Human-readable duration
  headers: true,            // Equivalent to standardHeaders
  legacyHeaders: false,
  message: 'Too many requests',
});

app.use(expressAdapter(limiter));
```

### Key differences

| Feature | express-rate-limit | RateCraft |
|---------|-------------------|-----------|
| Window format | Milliseconds only | `'15m'`, `'1h'`, or ms |
| Algorithms | Fixed window only | 4 algorithms |
| Storage | Via external stores | Built-in Memory, Redis, Memcached |
| Framework support | Express only | Express, Fastify, Hono |
| Fail strategy | Not built-in | `'open'` / `'closed'` with fallback |
| Event hooks | `onLimitReached` | `onAllow`, `onDeny`, `onError`, `onFallback` |
| Direct usage | Middleware only | `consume()` method for any context |

---

## Migrating from `rate-limiter-flexible`

### Before (rate-limiter-flexible)

```typescript
import { RateLimiterMemory } from 'rate-limiter-flexible';

const limiter = new RateLimiterMemory({
  points: 100,
  duration: 900, // 15 minutes in seconds
});

app.use(async (req, res, next) => {
  try {
    await limiter.consume(req.ip);
    next();
  } catch (rlRejected) {
    res.status(429).send('Too Many Requests');
  }
});
```

### After (RateCraft)

```typescript
import { RateCraft } from 'ratecraft';
import { expressAdapter } from 'ratecraft/express';

const limiter = new RateCraft({
  max: 100,             // Equivalent to "points"
  window: '15m',        // Equivalent to "duration: 900"
  statusCode: 429,
  message: { error: 'Too Many Requests' },
});

app.use(expressAdapter(limiter));
```

### Key differences

| Feature | rate-limiter-flexible | RateCraft |
|---------|----------------------|-----------|
| Points / max | `points` | `max` |
| Window | `duration` (seconds) | `window` (string or ms) |
| Key extraction | Manual in middleware | `keyGenerator` option |
| Headers | Manual | Automatic (IETF standard) |
| Framework adapters | Manual middleware | Built-in adapters |
| Error model | Throws `RateLimiterRes` | Returns `RateLimitResult` |

---

## Migrating between RateCraft algorithms

Changing algorithms is a single property change. However, be aware of behavioral differences:

```typescript
// Before: Fixed Window
const limiter = new RateCraft({
  algorithm: 'fixed-window',
  max: 100,
  window: '1m',
});

// After: Sliding Window Counter (smoother enforcement)
const limiter = new RateCraft({
  algorithm: 'sliding-window-counter',
  max: 100,
  window: '1m',
});
```

When switching algorithms with a shared store (Redis), consider clearing existing keys first, as different algorithms store data in different formats:

```typescript
await limiter.shutdown();
// Clear old algorithm data from Redis
await redis.keys('ratecraft:*').then(keys =>
  keys.length > 0 ? redis.del(...keys) : null
);
```

## Migrating between stores

Switching stores does not require any code changes beyond the store configuration:

```typescript
// Before: In-memory
const limiter = new RateCraft({
  max: 100,
  window: '15m',
});

// After: Redis (distributed)
import { RedisStore } from 'ratecraft/redis';
import Redis from 'ioredis';

const limiter = new RateCraft({
  max: 100,
  window: '15m',
  store: new RedisStore({ client: new Redis() }),
});
```

Active rate limit counters will reset when switching stores. Plan the migration during a low-traffic period if preserving counters is important.
