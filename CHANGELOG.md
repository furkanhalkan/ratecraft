# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-04-03

### Added

- H3/Nitro adapter (`ratecraft/h3`) for Nuxt ecosystem support
- `h3Adapter()` and `h3KeyGenerator()` exports
- H3/Nitro example (`examples/h3-nitro/`)
- Spesific error codes via `ErrorCode` constants (e.g. `ERR_INVALID_MAX`, `ERR_STORE_CONNECTION`)
- `cause` chain support on all error classes (ES2022 Error Cause standard)
- `storeName` property on `StoreError` to identify which store failed
- `statusCode` validation (must be 100-599)
- `max` option now validates for positive integers (floats are rejected)
- Rate limiter constructor validation unit tests (24 new tests)
- More usage examples in README: per-route limiting, user ID/API key, Redis distributed, hooks monitoring, skip patterns, direct usage

### Changed

- Upgraded Fastify to v5.7.2+ (security patch for CVE Content-Type validation bypass)
- Fastify peer dependency now supports both v4 and v5 (`^4.0.0 || ^5.0.0`)
- `fastify-plugin` peer dependency now supports both v4 and v5
- All error messages now prefixed with `[RateCraft]` for easy identification in logs
- Error messages now include actionable guidance (expected value, example usage)
- `parseDuration` now throws `ConfigError` instead of plain `Error` for consistency
- Store errors in `consume()` are now wrapped in `StoreError` with store name and cause chain
- Memcached store error messages now include key context
- Health check in fastify-redis example uses background polling instead of per-request Redis ping

### Breaking Changes

- `StoreError` constructor signature changed: `new StoreError(message, storeName, originalError, code?)` (previously `new StoreError(message, originalError)`)
- All `RateCraftError` messages are now prefixed with `[RateCraft]` — code matching on `error.message` may need updating

## [0.1.0] - 2026-04-01

### Added

- Initial release
- Four rate limiting algorithms: Token Bucket, Fixed Window, Sliding Window Counter, Sliding Window Log
- Three storage backends: In-Memory (with LRU eviction), Redis (Lua scripts), Memcached (CAS)
- Three framework adapters: Express, Fastify, Hono
- IETF-compliant rate limit headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`)
- Legacy header support (`X-RateLimit-*`)
- Fail-open and fail-closed strategies
- Fallback store support
- Event hooks: `onAllow`, `onDeny`, `onError`, `onFallback`
- Human-readable duration parsing (`'15m'`, `'1h'`, `'1d'`)
- Custom key generator support
- Request skip functionality
- Custom error classes: `RateCraftError`, `StoreError`, `ConfigError`
- Dual ESM and CommonJS output
- Full TypeScript strict mode support
- Benchmark suite with Vitest bench
- Comprehensive test suite (159+ tests, >90% coverage)
