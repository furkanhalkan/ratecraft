/**
 * RateCraft — H3/Nitro Example
 *
 * A lightweight H3 server with rate limiting.
 * Demonstrates global and per-route rate limiting for the Nuxt ecosystem.
 *
 * Run:
 *   pnpm install
 *   pnpm start
 *
 * Test:
 *   curl http://localhost:3003/
 *   curl http://localhost:3003/api/items
 */

import { createServer } from "node:http";
import { H3, toNodeHandler } from "h3";
import { RateCraft } from "ratecraft";
import { h3Adapter } from "ratecraft/h3";

const PORT = 3003;

// ─── Global rate limiter ────────────────────────────────────
// 100 requests per 15 minutes per IP address
const globalLimiter = new RateCraft({
  max: 100,
  window: "15m",
  hooks: {
    onDeny: (key, result) => {
      console.log(`[RATE LIMITED] key=${key} retryAfter=${result.retryAfter}s`);
    },
  },
});

// ─── Strict rate limiter for write operations ───────────────
// 10 requests per minute per IP
const writeLimiter = new RateCraft({
  algorithm: "sliding-window-counter",
  max: 10,
  window: "1m",
  message: { error: "Write rate limit exceeded. Please slow down." },
});

const app = new H3();

// ─── Apply global rate limiting ─────────────────────────────
app.use(h3Adapter(globalLimiter));

// ─── Routes ─────────────────────────────────────────────────
app.get("/", () => ({
  message: "Welcome to RateCraft H3/Nitro example!",
}));

app.get("/api/items", () => ({
  items: [
    { id: 1, name: "Item One" },
    { id: 2, name: "Item Two" },
    { id: 3, name: "Item Three" },
  ],
}));

// Write endpoints get an additional stricter rate limit via route middleware
app.post("/api/items", () => ({ message: "Item created (rate limited: 10/min)" }), {
  middleware: [h3Adapter(writeLimiter)],
});

app.get("/health", () => ({ status: "ok", runtime: "node" }));

// ─── Start ──────────────────────────────────────────────────
const server = createServer(toNodeHandler(app));
server.listen(PORT, () => {
  console.log(`H3 server running at http://localhost:${PORT}`);
  console.log("");
  console.log("Endpoints:");
  console.log(`  GET  http://localhost:${PORT}/            (100 req/15min)`);
  console.log(`  GET  http://localhost:${PORT}/api/items   (100 req/15min)`);
  console.log(`  POST http://localhost:${PORT}/api/items   (10 req/min)`);
  console.log(`  GET  http://localhost:${PORT}/health      (100 req/15min)`);
});
