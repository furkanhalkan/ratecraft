/**
 * RateCraft — Express Basic Example
 *
 * A simple Express server with rate limiting using the default
 * token bucket algorithm and in-memory store.
 *
 * Run:
 *   pnpm install
 *   pnpm start
 *
 * Test:
 *   curl http://localhost:3000/
 *   curl http://localhost:3000/api/data
 */

import express from "express";
import { RateCraft } from "ratecraft";
import { expressAdapter } from "ratecraft/express";

const app = express();
const PORT = 3000;

// ─── Global rate limiter ────────────────────────────────────
// 100 requests per 15 minutes per IP address
const globalLimiter = new RateCraft({
  max: 100,
  window: "15m",
  message: { error: "Too many requests. Please try again later." },
  hooks: {
    onDeny: (key, result) => {
      console.log(`[RATE LIMITED] key=${key} retryAfter=${result.retryAfter}s`);
    },
  },
});

app.use(expressAdapter(globalLimiter));

// ─── Strict rate limiter for auth endpoints ─────────────────
// 5 requests per minute per IP
const authLimiter = new RateCraft({
  algorithm: "sliding-window-counter",
  max: 5,
  window: "1m",
  statusCode: 429,
  message: { error: "Too many login attempts. Please wait before trying again." },
});

// ─── Routes ─────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({ message: "Welcome to RateCraft Express example!" });
});

app.get("/api/data", (_req, res) => {
  res.json({
    data: [
      { id: 1, name: "Item One" },
      { id: 2, name: "Item Two" },
      { id: 3, name: "Item Three" },
    ],
  });
});

app.post("/auth/login", expressAdapter(authLimiter), (_req, res) => {
  res.json({ message: "Login endpoint (rate limited: 5/min)" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ─── Start ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Express server running at http://localhost:${PORT}`);
  console.log("");
  console.log("Endpoints:");
  console.log(`  GET  http://localhost:${PORT}/           (100 req/15min)`);
  console.log(`  GET  http://localhost:${PORT}/api/data   (100 req/15min)`);
  console.log(`  POST http://localhost:${PORT}/auth/login (5 req/min)`);
  console.log(`  GET  http://localhost:${PORT}/health     (100 req/15min)`);
});
