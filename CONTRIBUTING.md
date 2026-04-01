# Contributing to RateCraft

Thank you for your interest in contributing to RateCraft! This guide will help you get started.

## Development Setup

1. **Fork and clone** the repository
2. **Install dependencies:**
   ```bash
   pnpm install
   ```
3. **Run the tests:**
   ```bash
   pnpm run test
   ```

## Development Workflow

### Available scripts

| Command | Description |
|---------|-------------|
| `pnpm run build` | Build ESM, CJS, and type declarations |
| `pnpm run test` | Run all tests |
| `pnpm run test:watch` | Run tests in watch mode |
| `pnpm run test:coverage` | Run tests with coverage report |
| `pnpm run lint` | Check code style with Biome |
| `pnpm run lint:fix` | Auto-fix code style issues |
| `pnpm run typecheck` | Run TypeScript type checking |
| `pnpm run bench` | Run benchmarks |

### Before submitting a PR

1. Ensure all tests pass: `pnpm run test`
2. Ensure no type errors: `pnpm run typecheck`
3. Ensure code passes linting: `pnpm run lint`
4. Ensure the project builds: `pnpm run build`
5. Add tests for any new functionality
6. Update documentation if the public API changes

## Project Structure

```
src/
  core/
    algorithms/    # Rate limiting algorithms
    rate-limiter.ts # Main RateCraft class
    types.ts        # All type definitions
    errors.ts       # Custom error classes
  stores/          # Storage backends (memory, redis, memcached)
  adapters/        # Framework adapters (express, fastify, hono)
  utils/           # Utility functions
tests/
  unit/            # Unit tests (mirror src/ structure)
  integration/     # Framework adapter integration tests
  e2e/             # End-to-end and concurrency tests
benchmarks/        # Performance benchmarks
```

## Writing Tests

- Place unit tests in `tests/unit/` mirroring the `src/` structure
- Use `vitest` as the test framework
- Aim for >90% code coverage on new code
- Use `vi.useFakeTimers()` for time-dependent tests
- Mock external services (Redis, Memcached) in unit tests

## Coding Standards

- **TypeScript strict mode** — no `any` types, use `unknown` with type guards
- **Biome** for linting and formatting (2-space indent, 100 char line width)
- **JSDoc** comments on all public functions and methods
- **Descriptive error messages** — include what was expected and what was received
- **No console.log** in production code

## Commit Messages

Use clear, descriptive commit messages:

- `feat: add sliding window counter algorithm`
- `fix: handle negative elapsed time in token bucket`
- `docs: update API reference for new hooks`
- `test: add boundary condition tests for fixed window`
- `perf: optimize memory store LRU eviction`

## Reporting Issues

- Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) for bugs
- Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md) for ideas
- Include reproduction steps, expected behavior, and actual behavior

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).
