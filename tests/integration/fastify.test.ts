import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { fastifyAdapter } from "../../src/adapters/fastify";
import { RateCraft } from "../../src/core/rate-limiter";

async function createApp(limiter: RateCraft) {
  const app = Fastify();
  await app.register(fastifyAdapter(limiter));
  app.get("/", async () => ({ ok: true }));
  return app;
}

describe("Fastify Adapter", () => {
  let limiter: RateCraft;

  afterEach(async () => {
    await limiter?.shutdown();
  });

  it("should return 200 for normal requests", async () => {
    limiter = new RateCraft({ max: 5, window: 10_000 });
    const app = await createApp(limiter);

    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("should return 429 when rate limit is exceeded", async () => {
    limiter = new RateCraft({ max: 2, window: 10_000 });
    const app = await createApp(limiter);

    await app.inject({ method: "GET", url: "/" });
    await app.inject({ method: "GET", url: "/" });
    const res = await app.inject({ method: "GET", url: "/" });

    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({ error: "Too Many Requests" });
  });

  it("should include RateLimit-Limit header", async () => {
    limiter = new RateCraft({ max: 10, window: 10_000 });
    const app = await createApp(limiter);

    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.headers["ratelimit-limit"]).toBe("10");
  });

  it("should decrement RateLimit-Remaining header", async () => {
    limiter = new RateCraft({ max: 5, window: 10_000 });
    const app = await createApp(limiter);

    const r1 = await app.inject({ method: "GET", url: "/" });
    expect(r1.headers["ratelimit-remaining"]).toBe("4");

    const r2 = await app.inject({ method: "GET", url: "/" });
    expect(r2.headers["ratelimit-remaining"]).toBe("3");
  });

  it("should include positive RateLimit-Reset header", async () => {
    limiter = new RateCraft({ max: 5, window: 10_000 });
    const app = await createApp(limiter);

    const res = await app.inject({ method: "GET", url: "/" });
    const reset = Number(res.headers["ratelimit-reset"]);
    expect(reset).toBeGreaterThan(0);
  });

  it("should include Retry-After header on 429", async () => {
    limiter = new RateCraft({ max: 1, window: 10_000 });
    const app = await createApp(limiter);

    await app.inject({ method: "GET", url: "/" });
    const res = await app.inject({ method: "GET", url: "/" });

    expect(res.statusCode).toBe(429);
    const retryAfter = Number(res.headers["retry-after"]);
    expect(retryAfter).toBeGreaterThan(0);
  });

  it("should skip requests when skip returns true", async () => {
    limiter = new RateCraft({
      max: 1,
      window: 10_000,
      skip: () => true,
    });
    const app = await createApp(limiter);

    await app.inject({ method: "GET", url: "/" });
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
  });

  it("should use custom keyGenerator", async () => {
    limiter = new RateCraft({
      max: 1,
      window: 10_000,
      keyGenerator: (req) => {
        const r = req as { url?: string };
        return r.url ?? "unknown";
      },
    });
    const app = Fastify();
    await app.register(fastifyAdapter(limiter));
    app.get("/a", async () => ({ route: "a" }));
    app.get("/b", async () => ({ route: "b" }));

    await app.inject({ method: "GET", url: "/a" });
    const resA = await app.inject({ method: "GET", url: "/a" });
    expect(resA.statusCode).toBe(429);

    const resB = await app.inject({ method: "GET", url: "/b" });
    expect(resB.statusCode).toBe(200);
  });

  it("should return custom message", async () => {
    limiter = new RateCraft({
      max: 1,
      window: 10_000,
      message: { error: "Slow down!", code: "RATE_LIMITED" },
    });
    const app = await createApp(limiter);

    await app.inject({ method: "GET", url: "/" });
    const res = await app.inject({ method: "GET", url: "/" });

    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({ error: "Slow down!", code: "RATE_LIMITED" });
  });

  it("should return custom statusCode", async () => {
    limiter = new RateCraft({
      max: 1,
      window: 10_000,
      statusCode: 503,
    });
    const app = await createApp(limiter);

    await app.inject({ method: "GET", url: "/" });
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(503);
  });

  it("should call onRateLimited callback", async () => {
    let callbackCalled = false;
    limiter = new RateCraft({
      max: 1,
      window: 10_000,
      onRateLimited: () => {
        callbackCalled = true;
      },
    });
    const app = await createApp(limiter);

    await app.inject({ method: "GET", url: "/" });
    await app.inject({ method: "GET", url: "/" });

    expect(callbackCalled).toBe(true);
  });
});
