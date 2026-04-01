import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { honoAdapter } from "../../src/adapters/hono";
import { RateCraft } from "../../src/core/rate-limiter";

function createApp(limiter: RateCraft) {
  const app = new Hono();
  app.use("*", honoAdapter(limiter));
  app.get("/", (c) => c.json({ ok: true }));
  app.get("/a", (c) => c.json({ route: "a" }));
  app.get("/b", (c) => c.json({ route: "b" }));
  return app;
}

function makeReq(path = "/", ip = "127.0.0.1") {
  return new Request(`http://localhost${path}`, {
    headers: { "x-forwarded-for": ip },
  });
}

describe("Hono Adapter", () => {
  let limiter: RateCraft;

  afterEach(async () => {
    await limiter?.shutdown();
  });

  it("should return 200 for normal requests", async () => {
    limiter = new RateCraft({ max: 5, window: 10_000 });
    const app = createApp(limiter);

    const res = await app.request(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("should return 429 when rate limit is exceeded", async () => {
    limiter = new RateCraft({ max: 2, window: 10_000 });
    const app = createApp(limiter);

    await app.request(makeReq());
    await app.request(makeReq());
    const res = await app.request(makeReq());

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Too Many Requests" });
  });

  it("should include RateLimit-Limit header", async () => {
    limiter = new RateCraft({ max: 10, window: 10_000 });
    const app = createApp(limiter);

    const res = await app.request(makeReq());
    expect(res.headers.get("RateLimit-Limit")).toBe("10");
  });

  it("should decrement RateLimit-Remaining header", async () => {
    limiter = new RateCraft({ max: 5, window: 10_000 });
    const app = createApp(limiter);

    const r1 = await app.request(makeReq());
    expect(r1.headers.get("RateLimit-Remaining")).toBe("4");

    const r2 = await app.request(makeReq());
    expect(r2.headers.get("RateLimit-Remaining")).toBe("3");
  });

  it("should include positive RateLimit-Reset header", async () => {
    limiter = new RateCraft({ max: 5, window: 10_000 });
    const app = createApp(limiter);

    const res = await app.request(makeReq());
    const reset = Number(res.headers.get("RateLimit-Reset"));
    expect(reset).toBeGreaterThan(0);
  });

  it("should include Retry-After header on 429", async () => {
    limiter = new RateCraft({ max: 1, window: 10_000 });
    const app = createApp(limiter);

    await app.request(makeReq());
    const res = await app.request(makeReq());

    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
  });

  it("should skip requests when skip returns true", async () => {
    limiter = new RateCraft({
      max: 1,
      window: 10_000,
      skip: () => true,
    });
    const app = createApp(limiter);

    await app.request(makeReq());
    const res = await app.request(makeReq());
    expect(res.status).toBe(200);
  });

  it("should use custom keyGenerator", async () => {
    limiter = new RateCraft({
      max: 1,
      window: 10_000,
      keyGenerator: (req) => {
        const r = req as Request;
        return new URL(r.url).pathname;
      },
    });
    const app = createApp(limiter);

    await app.request(makeReq("/a"));
    const resA = await app.request(makeReq("/a"));
    expect(resA.status).toBe(429);

    const resB = await app.request(makeReq("/b"));
    expect(resB.status).toBe(200);
  });

  it("should return custom message", async () => {
    limiter = new RateCraft({
      max: 1,
      window: 10_000,
      message: { error: "Slow down!", code: "RATE_LIMITED" },
    });
    const app = createApp(limiter);

    await app.request(makeReq());
    const res = await app.request(makeReq());

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Slow down!", code: "RATE_LIMITED" });
  });

  it("should return custom statusCode", async () => {
    limiter = new RateCraft({
      max: 1,
      window: 10_000,
      statusCode: 503,
    });
    const app = createApp(limiter);

    await app.request(makeReq());
    const res = await app.request(makeReq());
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

    await app.request(makeReq());
    await app.request(makeReq());

    expect(callbackCalled).toBe(true);
  });
});
