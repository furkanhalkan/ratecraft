/**
 * RateCraft — Hono + Bun Example
 *
 * A lightweight Hono server running on Bun with rate limiting.
 * Demonstrates per-route rate limiting and the skip option.
 *
 * Run:
 *   bun install
 *   bun start
 *
 * Test:
 *   curl http://localhost:3002/
 *   curl http://localhost:3002/api/posts
 */

import { Hono } from "hono";
import { RateCraft } from "ratecraft";
import { honoAdapter } from "ratecraft/hono";

const app = new Hono();
const PORT = 3002;

// ─── Global rate limiter ────────────────────────────────────
// 200 requests per 10 minutes, skip health checks
const globalLimiter = new RateCraft({
  algorithm: "sliding-window-counter",
  max: 200,
  window: "10m",
  skip: (req) => {
    const url = new URL((req as Request).url);
    return url.pathname === "/health";
  },
  hooks: {
    onDeny: (key, result) => {
      console.log(`[RATE LIMITED] key=${key} retryAfter=${result.retryAfter}s`);
    },
  },
});

// ─── Strict API limiter ─────────────────────────────────────
// 20 requests per minute for write operations
const writeLimiter = new RateCraft({
  algorithm: "token-bucket",
  max: 20,
  window: "1m",
  message: { error: "Write rate limit exceeded. Please slow down." },
});

// ─── Apply global rate limiting ─────────────────────────────
app.use("*", honoAdapter(globalLimiter));

// ─── Routes ─────────────────────────────────────────────────
app.get("/", (c) => c.json({ message: "Welcome to RateCraft Hono + Bun example!" }));

app.get("/api/posts", (c) =>
  c.json({
    posts: [
      { id: 1, title: "Getting Started with RateCraft", author: "Alice" },
      { id: 2, title: "Rate Limiting Best Practices", author: "Bob" },
      { id: 3, title: "Scaling with Redis", author: "Charlie" },
    ],
  }),
);

// Write endpoints get an additional stricter rate limit
app.post("/api/posts", honoAdapter(writeLimiter), (c) =>
  c.json({ message: "Post created (rate limited: 20/min)" }, 201),
);

app.put("/api/posts/:id", honoAdapter(writeLimiter), (c) => {
  const id = c.req.param("id");
  return c.json({ message: `Post ${id} updated (rate limited: 20/min)` });
});

app.get("/health", (c) => c.json({ status: "ok", runtime: "bun" }));

// ─── Start ──────────────────────────────────────────────────
console.log(`Hono server running at http://localhost:${PORT}`);
console.log("");
console.log("Endpoints:");
console.log(`  GET  http://localhost:${PORT}/              (200 req/10min)`);
console.log(`  GET  http://localhost:${PORT}/api/posts     (200 req/10min)`);
console.log(`  POST http://localhost:${PORT}/api/posts     (20 req/min)`);
console.log(`  PUT  http://localhost:${PORT}/api/posts/:id (20 req/min)`);
console.log(`  GET  http://localhost:${PORT}/health        (not rate limited)`);

export default {
  port: PORT,
  fetch: app.fetch,
};
