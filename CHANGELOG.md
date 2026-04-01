# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
