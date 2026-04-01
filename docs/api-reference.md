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

---

## Error Classes

### `RateCraftError`

Base error class. Properties: `message`, `code`.

### `ConfigError`

Thrown for invalid configuration. Code: `'CONFIG_ERROR'`.

### `StoreError`

Thrown when a store operation fails. Code: `'STORE_ERROR'`. Additional property: `originalError`.

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
