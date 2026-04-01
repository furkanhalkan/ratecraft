---
name: Bug Report
about: Report a bug to help us improve RateCraft
title: ''
labels: bug
assignees: ''
---

## Description

A clear and concise description of the bug.

## Steps to Reproduce

1. Configure RateCraft with `...`
2. Send requests to `...`
3. Observe `...`

## Expected Behavior

What you expected to happen.

## Actual Behavior

What actually happened. Include any error messages or unexpected output.

## Code Example

```typescript
// Minimal reproduction code
import { RateCraft } from 'ratecraft';

const limiter = new RateCraft({
  max: 100,
  window: '15m',
});

// ...
```

## Environment

- **RateCraft version:** 
- **Node.js version:** 
- **Runtime:** Node.js / Bun / Deno
- **Framework:** Express / Fastify / Hono / None
- **Store:** Memory / Redis / Memcached / Custom
- **Algorithm:** token-bucket / fixed-window / sliding-window-counter / sliding-window-log
- **OS:** 

## Additional Context

Add any other context about the problem here (logs, screenshots, related issues).
