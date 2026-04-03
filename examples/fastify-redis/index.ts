/**
 * RateCraft — Fastify + Redis Example
 *
 * A Fastify server with distributed rate limiting backed by Redis.
 * Demonstrates fail-open strategy with in-memory fallback.
 *
 * Prerequisites:
 *   Redis running on localhost:6379
 *
 * Run:
 *   pnpm install
 *   pnpm start
 *
 * Test:
 *   curl http://localhost:3001/
 *   curl http://localhost:3001/api/users
 */

import Fastify from "fastify";
import Redis from "ioredis";
import { MemoryStore, RateCraft } from "ratecraft";
import { fastifyAdapter } from "ratecraft/fastify";
import { RedisStore } from "ratecraft/redis";

const PORT = 3001;

async function main() {
  const app = Fastify({ logger: true });

  // ─── Redis connection ───────────────────────────────────────
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

  redis.on("error", (err) => {
    console.error("Redis connection error:", err.message);
  });

  // ─── Distributed rate limiter ───────────────────────────────
  // Uses Redis for shared state across multiple server instances.
  // Falls back to in-memory if Redis is unavailable.
  const limiter = new RateCraft({
    algorithm: "fixed-window",
    max: 50,
    window: "1m",
    store: new RedisStore({
      client: redis,
      prefix: "rl:fastify:",
    }),
    failStrategy: "open",
    fallbackStore: new MemoryStore(),
    hooks: {
      onAllow: (key, result) => {
        app.log.debug({ key, remaining: result.remaining }, "Request allowed");
      },
      onDeny: (key, result) => {
        app.log.warn({ key, retryAfter: result.retryAfter }, "Request denied");
      },
      onError: (error) => {
        app.log.error({ err: error }, "Rate limiter store error");
      },
      onFallback: (error) => {
        app.log.warn({ err: error }, "Switched to fallback store");
      },
    },
  });

  // ─── Register adapter ───────────────────────────────────────
  await app.register(fastifyAdapter(limiter));

  // ─── Routes ─────────────────────────────────────────────────
  app.get("/", async () => ({
    message: "Welcome to RateCraft Fastify + Redis example!",
  }));

  app.get("/api/users", async () => ({
    users: [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
      { id: 3, name: "Charlie" },
    ],
  }));

  // Health check — Redis status is updated by a background timer so the
  // handler itself performs no expensive I/O (avoids CWE-400 / CWE-770).
  let redisHealthy = true;
  const healthInterval = setInterval(async () => {
    redisHealthy = await redis
      .ping()
      .then((r) => r === "PONG")
      .catch(() => false);
  }, 5_000);
  healthInterval.unref(); // don't keep the process alive

  app.get("/health", async () => ({
    status: "ok",
    redis: redisHealthy ? "connected" : "disconnected",
  }));

  // ─── Graceful shutdown ──────────────────────────────────────
  app.addHook("onClose", async () => {
    clearInterval(healthInterval);
    await limiter.shutdown();
    await redis.quit();
  });

  // ─── Start ──────────────────────────────────────────────────
  await app.listen({ port: PORT });
  console.log(`Fastify server running at http://localhost:${PORT}`);
  console.log("");
  console.log("Endpoints:");
  console.log(`  GET http://localhost:${PORT}/          (50 req/min)`);
  console.log(`  GET http://localhost:${PORT}/api/users (50 req/min)`);
  console.log(`  GET http://localhost:${PORT}/health`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
