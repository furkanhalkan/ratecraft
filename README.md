# RateCraft

[![npm version](https://img.shields.io/npm/v/ratecraft.svg)](https://www.npmjs.com/package/ratecraft)
[![CI](https://github.com/furkanalkan/ratecraft/actions/workflows/ci.yml/badge.svg)](https://github.com/furkanalkan/ratecraft/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)

**Framework-agnostic, TypeScript-first rate limiter for Node.js, Bun, and Deno.**

Zero runtime dependencies. Four battle-tested algorithms. Pluggable storage backends. First-class support for Express, Fastify, and Hono.

## Features

- **Four algorithms** — Token Bucket, Fixed Window, Sliding Window Counter, Sliding Window Log
- **Three storage backends** — In-memory (with LRU eviction), Redis (Lua scripts), Memcached (CAS)
- **Three framework adapters** — Express, Fastify, Hono
- **Zero runtime dependencies** — core package has no external dependencies
- **TypeScript-first** — strict mode, full type coverage, no `any`
- **Dual module output** — ESM and CommonJS
- **IETF-compliant headers** — follows `draft-ietf-httpapi-ratelimit-headers`
- **Graceful degradation** — fail-open/fail-closed strategies with fallback stores
- **Event hooks** — `onAllow`, `onDeny`, `onError`, `onFallback`
- **Tree-shakeable** — sub-path imports keep your bundle lean

## Installation

```bash
# npm
npm install ratecraft

# pnpm
pnpm add ratecraft

# yarn
yarn add ratecraft

# bun
bun add ratecraft
```

### Optional peer dependencies

Install only what you need:

```bash
# Redis support
pnpm add ioredis

# Memcached support
pnpm add memcached

# Framework adapters (install only the one you use)
pnpm add express
pnpm add fastify fastify-plugin
pnpm add hono
```

## Quick Start

### Direct usage (framework-agnostic)

```typescript
import { RateCraft } from 'ratecraft';

const limiter = new RateCraft({
  max: 100,       // 100 requests
  window: '15m',  // per 15-minute window
});

const result = await limiter.consume('user-123');

if (result.allowed) {
  // Process the request
  console.log(`Remaining: ${result.remaining}`);
} else {
  // Rate limited
  console.log(`Retry after ${result.retryAfter} seconds`);
}
```

### Express

```typescript
import express from 'express';
import { RateCraft } from 'ratecraft';
import { expressAdapter } from 'ratecraft/express';

const app = express();

const limiter = new RateCraft({
  max: 100,
  window: '15m',
  message: { error: 'Too many requests, please try again later.' },
});

app.use(expressAdapter(limiter));

app.get('/', (req, res) => {
  res.json({ message: 'Hello!' });
});
```

### Fastify

```typescript
import Fastify from 'fastify';
import { RateCraft } from 'ratecraft';
import { fastifyAdapter } from 'ratecraft/fastify';

const app = Fastify();

const limiter = new RateCraft({
  max: 100,
  window: '15m',
});

await app.register(fastifyAdapter(limiter));

app.get('/', async () => ({ message: 'Hello!' }));
```

### Hono

```typescript
import { Hono } from 'hono';
import { RateCraft } from 'ratecraft';
import { honoAdapter } from 'ratecraft/hono';

const app = new Hono();

const limiter = new RateCraft({
  max: 100,
  window: '15m',
});

app.use('*', honoAdapter(limiter));

app.get('/', (c) => c.json({ message: 'Hello!' }));
```

## Algorithms

| Algorithm | Best For | Accuracy | Memory |
|-----------|----------|----------|--------|
| `token-bucket` (default) | APIs allowing burst traffic | Good | Low |
| `fixed-window` | Simple, predictable rate limiting | Moderate | Lowest |
| `sliding-window-counter` | Balanced accuracy and performance | High | Low |
| `sliding-window-log` | Maximum precision | Highest | High |

```typescript
const limiter = new RateCraft({
  algorithm: 'sliding-window-counter',
  max: 100,
  window: '1h',
});
```

> **Note:** Fixed Window has a known boundary issue where up to 2x the limit can pass within a short window at the boundary. Use Sliding Window Counter or Sliding Window Log if this matters for your use case. See [docs/algorithms.md](docs/algorithms.md) for details.

## Configuration

```typescript
import { RateCraft } from 'ratecraft';

const limiter = new RateCraft({
  // Required
  max: 100,                          // Maximum requests per window
  window: '15m',                     // Window duration (string or ms)

  // Algorithm (default: 'token-bucket')
  algorithm: 'token-bucket',

  // Store (default: in-memory)
  store: new MemoryStore({ maxEntries: 50_000 }),

  // Key generator (default: req.ip)
  keyGenerator: (req) => req.headers['x-api-key'],

  // Response customization
  statusCode: 429,                   // HTTP status when rate limited
  message: { error: 'Too Many Requests' },

  // Headers
  headers: true,                     // Send RateLimit-* headers
  legacyHeaders: false,              // Also send X-RateLimit-* headers

  // Skip certain requests
  skip: (req) => req.path === '/health',

  // Callback when rate limited
  onRateLimited: (req, result) => {
    console.warn(`Rate limited: ${result.retryAfter}s`);
  },

  // Error handling
  failStrategy: 'open',             // 'open' = allow, 'closed' = deny
  fallbackStore: new MemoryStore(),  // Fallback when primary store fails

  // Event hooks
  hooks: {
    onAllow: (key, result) => metrics.increment('allowed'),
    onDeny: (key, result) => metrics.increment('denied'),
    onError: (error, key) => logger.error(error),
    onFallback: (error, store) => logger.warn(`Fallback: ${store}`),
  },
});
```

### Window duration formats

| Format | Duration |
|--------|----------|
| `'1s'` | 1 second |
| `'30s'` | 30 seconds |
| `'5m'` | 5 minutes |
| `'1h'` | 1 hour |
| `'1d'` | 1 day |
| `60000` | 60,000 ms |

## Storage Backends

### In-Memory (default)

```typescript
import { RateCraft, MemoryStore } from 'ratecraft';

const limiter = new RateCraft({
  max: 100,
  window: '15m',
  store: new MemoryStore({
    maxEntries: 10_000,       // LRU eviction threshold (default: 10,000)
    cleanupInterval: 60_000,  // Expired entry cleanup interval (default: 60s)
  }),
});
```

### Redis

```typescript
import { RateCraft } from 'ratecraft';
import { RedisStore } from 'ratecraft/redis';
import Redis from 'ioredis';

const redis = new Redis();

const limiter = new RateCraft({
  max: 100,
  window: '15m',
  store: new RedisStore({
    client: redis,
    prefix: 'ratecraft:',  // Key prefix (default: "ratecraft:")
  }),
});
```

All Redis operations use Lua scripts for atomicity. Scripts are loaded once via `SCRIPT LOAD` and executed via `EVALSHA` with automatic `EVAL` fallback on `NOSCRIPT` errors.

### Memcached

```typescript
import { RateCraft } from 'ratecraft';
import { MemcachedStore } from 'ratecraft/memcached';
import Memcached from 'memcached';

const memcached = new Memcached('localhost:11211');

const limiter = new RateCraft({
  max: 100,
  window: '15m',
  store: new MemcachedStore({
    client: memcached,
    prefix: 'ratecraft:',  // Key prefix (default: "ratecraft:")
  }),
});
```

### Custom Store

Implement the `RateLimitStore` interface to use any storage backend. See [docs/custom-store.md](docs/custom-store.md) for a complete guide.

## Response Headers

RateCraft follows the [IETF RateLimit header fields](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/) standard:

| Header | Description |
|--------|-------------|
| `RateLimit-Limit` | Maximum requests allowed |
| `RateLimit-Remaining` | Remaining requests in the current window |
| `RateLimit-Reset` | Seconds until the window resets |
| `Retry-After` | Seconds to wait before retrying (only on 429) |

Enable legacy headers with `legacyHeaders: true` to also send `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`.

## Error Handling

### Fail strategies

| Strategy | Behavior | Use Case |
|----------|----------|----------|
| `'open'` (default) | Allow requests when the store is unavailable | Availability-first. Rate limiting is temporarily disabled. |
| `'closed'` | Deny requests when the store is unavailable | Security-first. Use when DDoS protection is critical. |

### Fallback store

When the primary store fails, RateCraft can automatically switch to a fallback:

```typescript
const limiter = new RateCraft({
  max: 100,
  window: '15m',
  store: new RedisStore({ client: redis }),
  fallbackStore: new MemoryStore(),
  hooks: {
    onFallback: (error, store) => {
      console.warn(`Fell back to ${store}: ${error.message}`);
    },
  },
});
```

> **Note:** When the fallback is active, rate limiting becomes per-instance (not distributed). This is a trade-off for availability.

## Benchmarks

Measured on an in-memory store with unique keys per iteration:

| Benchmark | ops/sec |
|-----------|---------|
| Token Bucket (same key) | 1,176,000+ |
| Fixed Window (same key) | 875,000+ |
| MemoryStore.get (miss) | 3,416,000+ |
| MemoryStore.set | 1,086,000+ |

Run benchmarks locally:

```bash
pnpm run bench
```

## API Reference

See [docs/api-reference.md](docs/api-reference.md) for the complete API documentation.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
