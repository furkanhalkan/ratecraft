# API Reference

## `RateCraft`

The main class for rate limiting.

### Constructor

```typescript
new RateCraft(options: RateCraftOptions)
```

#### `RateCraftOptions`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `max` | `number` | *required* | Maximum requests per window |
| `window` | `string \| number` | *required* | Window duration (`'15m'`, `'1h'`) or milliseconds |
| `algorithm` | `AlgorithmType` | `'token-bucket'` | Rate limiting algorithm |
| `store` | `RateLimitStore` | `MemoryStore` | Storage backend |
| `keyGenerator` | `(req: unknown) => string` | `req.ip` | Function to extract the rate limit key |
| `statusCode` | `number` | `429` | HTTP status code when rate limited |
| `message` | `string \| object` | `{ error: 'Too Many Requests' }` | Response body when rate limited |
| `headers` | `boolean` | `true` | Include `RateLimit-*` response headers |
| `legacyHeaders` | `boolean` | `false` | Also include `X-RateLimit-*` headers |
| `skip` | `(req: unknown) => boolean \| Promise<boolean>` | `() => false` | Skip rate limiting for certain requests |
| `onRateLimited` | `(req: unknown, result: RateLimitResult) => void` | no-op | Called when a request is rate limited |
| `failStrategy` | `'open' \| 'closed'` | `'open'` | Behavior when the store is unavailable |
| `fallbackStore` | `RateLimitStore` | `undefined` | Fallback store when the primary fails |
| `hooks` | `RateCraftHooks` | `{}` | Event hooks |

### Methods

#### `consume(key: string): Promise<RateLimitResult>`

Evaluate the rate limit for the given key. Returns the result without sending any HTTP response.

```typescript
const result = await limiter.consume('user-123');
```

#### `reset(key: string): Promise<void>`

Reset the rate limit counter for the given key.

```typescript
await limiter.reset('user-123');
```

#### `shutdown(): Promise<void>`

Shut down the store and clean up resources (timers, connections).

```typescript
await limiter.shutdown();
```

#### `getOptions(): ResolvedOptions`

Returns the fully resolved configuration with all defaults applied. Primarily used by framework adapters.

---

## `RateLimitResult`

Returned by `consume()`.

| Property | Type | Description |
|----------|------|-------------|
| `allowed` | `boolean` | Whether the request was allowed |
| `remaining` | `number` | Remaining requests in the current window |
| `limit` | `number` | Total request limit |
| `resetIn` | `number` | Milliseconds until the window resets |
| `resetAt` | `number` | Unix timestamp (ms) when the window resets |
| `retryAfter` | `number` | Seconds to wait before retrying (meaningful only when `allowed` is `false`) |

---

## `RateCraftHooks`

| Hook | Signature | Description |
|------|-----------|-------------|
| `onAllow` | `(key: string, result: RateLimitResult) => void` | Called when a request is allowed |
| `onDeny` | `(key: string, result: RateLimitResult) => void` | Called when a request is denied |
| `onError` | `(error: Error, key: string) => void` | Called when a store error occurs |
| `onFallback` | `(error: Error, fallbackStore: string) => void` | Called when switching to the fallback store |

---

## Stores

### `MemoryStore`

```typescript
import { MemoryStore } from 'ratecraft';

new MemoryStore(options?: MemoryStoreOptions)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxEntries` | `number` | `10_000` | Maximum entries before LRU eviction |
| `cleanupInterval` | `number` | `60_000` | Interval (ms) for cleaning up expired entries |

### `RedisStore`

```typescript
import { RedisStore } from 'ratecraft/redis';

new RedisStore(options: RedisStoreOptions)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `client` | `Redis` (ioredis) | *required* | ioredis client instance |
| `prefix` | `string` | `'ratecraft:'` | Key prefix for all Redis keys |

### `MemcachedStore`

```typescript
import { MemcachedStore } from 'ratecraft/memcached';

new MemcachedStore(options: MemcachedStoreOptions)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `client` | `Memcached` | *required* | Memcached client instance |
| `prefix` | `string` | `'ratecraft:'` | Key prefix for all Memcached keys |

---

## `RateLimitStore` Interface

Implement this interface to create a custom storage backend.

```typescript
interface RateLimitStore {
  get(key: string): Promise<RateLimitRecord | null>;
  set(key: string, record: RateLimitRecord, ttl: number): Promise<void>;
  increment(key: string, amount?: number): Promise<number>;
  reset(key: string): Promise<void>;
  resetAll?(): Promise<void>;
  shutdown?(): Promise<void>;
  isHealthy?(): Promise<boolean>;
}
```

See [custom-store.md](custom-store.md) for a complete implementation guide.

---

## Framework Adapters

### Express

```typescript
import { expressAdapter } from 'ratecraft/express';

app.use(expressAdapter(limiter));
```

### Fastify

```typescript
import { fastifyAdapter } from 'ratecraft/fastify';

await app.register(fastifyAdapter(limiter));
```

### Hono

```typescript
import { honoAdapter } from 'ratecraft/hono';

app.use('*', honoAdapter(limiter));
```

### H3 / Nitro / Nuxt

```typescript
import { h3Adapter, h3KeyGenerator } from 'ratecraft/h3';

// As global middleware
app.use(h3Adapter(limiter));

// As per-route middleware
app.post('/api/items', handler, { middleware: [h3Adapter(limiter)] });
```

#### `h3KeyGenerator(event: H3Event): string`

Default key generator for H3 that extracts the client IP using `getRequestIP` with `x-forwarded-for` support. Returns `'unknown'` if no IP can be determined.

```typescript
import { h3KeyGenerator } from 'ratecraft/h3';

const limiter = new RateCraft({
  max: 100,
  window: '15m',
  keyGenerator: h3KeyGenerator,
});
```

For Nuxt server middleware, create `server/middleware/rate-limit.ts`:

```typescript
import { RateCraft } from 'ratecraft';
import { h3Adapter } from 'ratecraft/h3';

const limiter = new RateCraft({ max: 100, window: '15m' });
export default h3Adapter(limiter);
```

---

## Error Classes

### `RateCraftError`

Base error class. Properties: `message`, `code`, `cause`.

All error messages are prefixed with `[RateCraft]` for easy identification in logs.

### `ConfigError`

Thrown for invalid configuration. Uses specific error codes from `ErrorCode`.

### `StoreError`

Thrown when a store operation fails. Properties: `storeName`, `originalError`, `cause`.

### `ErrorCode`

Constants for all error codes:

| Code | Description |
|------|-------------|
| `ERR_INVALID_MAX` | `max` is not a positive integer |
| `ERR_INVALID_WINDOW` | `window` is not a valid duration |
| `ERR_INVALID_DURATION` | Duration string format is invalid |
| `ERR_INVALID_STATUS_CODE` | `statusCode` is not in range 100-599 |
| `ERR_UNKNOWN_ALGORITHM` | Unknown algorithm name |
| `ERR_STORE` | General store error |
| `ERR_STORE_GET_FAILED` | Store get operation failed |
| `ERR_STORE_SET_FAILED` | Store set operation failed |
| `ERR_STORE_INCREMENT_FAILED` | Store increment failed |
| `ERR_STORE_CONNECTION` | Store connection error |
| `ERR_STORE_PARSE` | Store data parse error |

```typescript
import { ErrorCode, ConfigError } from 'ratecraft';

try {
  new RateCraft({ max: -1, window: '1m' });
} catch (err) {
  if (err instanceof ConfigError) {
    console.log(err.code); // 'ERR_INVALID_MAX'
  }
}
```

---

## Utility Functions

### `parseDuration(duration: string | number): number`

Parse a human-readable duration string into milliseconds.

```typescript
import { parseDuration } from 'ratecraft';

parseDuration('15m'); // 900000
parseDuration('1h');  // 3600000
parseDuration(5000);  // 5000
```

### `buildRateLimitHeaders(result: RateLimitResult, legacy?: boolean): Record<string, string>`

Build IETF-compliant rate limit response headers.

```typescript
import { buildRateLimitHeaders } from 'ratecraft';

const headers = buildRateLimitHeaders(result, true);
// { 'RateLimit-Limit': '100', 'RateLimit-Remaining': '95', ... }
```
