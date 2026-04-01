import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { expressAdapter } from "../../src/adapters/express";
import { RateCraft } from "../../src/core/rate-limiter";

function createApp(limiter: RateCraft) {
  const app = express();
  app.use(expressAdapter(limiter));
  app.get("/", (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe("Express Adapter", () => {
  let limiter: RateCraft;

  afterEach(async () => {
    await limiter?.shutdown();
  });

  it("should return 200 for normal requests", async () => {
    limiter = new RateCraft({ max: 5, window: 10_000 });
    const app = createApp(limiter);

    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("should return 429 when rate limit is exceeded", async () => {
    limiter = new RateCraft({ max: 2, window: 10_000 });
    const app = createApp(limiter);

    await request(app).get("/");
    await request(app).get("/");
    const res = await request(app).get("/");

    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: "Too Many Requests" });
  });

  it("should include RateLimit-Limit header", async () => {
    limiter = new RateCraft({ max: 10, window: 10_000 });
    const app = createApp(limiter);

    const res = await request(app).get("/");
    expect(res.headers["ratelimit-limit"]).toBe("10");
  });

  it("should decrement RateLimit-Remaining header", async () => {
    limiter = new RateCraft({ max: 5, window: 10_000 });
    const app = createApp(limiter);

    const r1 = await request(app).get("/");
    expect(r1.headers["ratelimit-remaining"]).toBe("4");

    const r2 = await request(app).get("/");
    expect(r2.headers["ratelimit-remaining"]).toBe("3");
  });

  it("should include positive RateLimit-Reset header", async () => {
    limiter = new RateCraft({ max: 5, window: 10_000 });
    const app = createApp(limiter);

    const res = await request(app).get("/");
    const reset = Number(res.headers["ratelimit-reset"]);
    expect(reset).toBeGreaterThan(0);
  });

  it("should include Retry-After header on 429", async () => {
    limiter = new RateCraft({ max: 1, window: 10_000 });
    const app = createApp(limiter);

    await request(app).get("/");
    const res = await request(app).get("/");

    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers["retry-after"]);
    expect(retryAfter).toBeGreaterThan(0);
  });

  it("should skip requests when skip returns true", async () => {
    limiter = new RateCraft({
      max: 1,
      window: 10_000,
      skip: () => true,
    });
    const app = createApp(limiter);

    // Even though max=1, skip bypasses rate limiting
    await request(app).get("/");
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
  });

  it("should use custom keyGenerator", async () => {
    limiter = new RateCraft({
      max: 1,
      window: 10_000,
      keyGenerator: (req) => {
        const r = req as express.Request;
        return r.path;
      },
    });
    const app = express();
    app.use(expressAdapter(limiter));
    app.get("/a", (_req, res) => res.json({ route: "a" }));
    app.get("/b", (_req, res) => res.json({ route: "b" }));

    // /a exhausted
    await request(app).get("/a");
    const resA = await request(app).get("/a");
    expect(resA.status).toBe(429);

    // /b still available (different key)
    const resB = await request(app).get("/b");
    expect(resB.status).toBe(200);
  });

  it("should return custom message", async () => {
    limiter = new RateCraft({
      max: 1,
      window: 10_000,
      message: { error: "Slow down!", code: "RATE_LIMITED" },
    });
    const app = createApp(limiter);

    await request(app).get("/");
    const res = await request(app).get("/");

    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: "Slow down!", code: "RATE_LIMITED" });
  });

  it("should return custom statusCode", async () => {
    limiter = new RateCraft({
      max: 1,
      window: 10_000,
      statusCode: 503,
    });
    const app = createApp(limiter);

    await request(app).get("/");
    const res = await request(app).get("/");

    expect(res.status).toBe(503);
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
    const app = createApp(limiter);

    await request(app).get("/");
    await request(app).get("/");

    expect(callbackCalled).toBe(true);
  });

  it("should not include headers when headers=false", async () => {
    limiter = new RateCraft({
      max: 5,
      window: 10_000,
      headers: false,
    });
    const app = createApp(limiter);

    const res = await request(app).get("/");
    expect(res.headers["ratelimit-limit"]).toBeUndefined();
    expect(res.headers["ratelimit-remaining"]).toBeUndefined();
    expect(res.headers["ratelimit-reset"]).toBeUndefined();
  });

  it("should include legacy headers when legacyHeaders=true", async () => {
    limiter = new RateCraft({
      max: 5,
      window: 10_000,
      legacyHeaders: true,
    });
    const app = createApp(limiter);

    const res = await request(app).get("/");
    expect(res.headers["x-ratelimit-limit"]).toBe("5");
    expect(res.headers["x-ratelimit-remaining"]).toBeDefined();
    expect(res.headers["x-ratelimit-reset"]).toBeDefined();
  });

  it("should work with different algorithms", async () => {
    limiter = new RateCraft({
      max: 2,
      window: 10_000,
      algorithm: "fixed-window",
    });
    const app = createApp(limiter);

    await request(app).get("/");
    await request(app).get("/");
    const res = await request(app).get("/");

    expect(res.status).toBe(429);
  });
});
