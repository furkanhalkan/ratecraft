"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
var ratecraft_1 = require("ratecraft");
var express_2 = require("ratecraft/express");
var app = (0, express_1.default)();
var PORT = 3000;
// ─── Global rate limiter ────────────────────────────────────
// 100 requests per 15 minutes per IP address
var globalLimiter = new ratecraft_1.RateCraft({
    max: 100,
    window: "15m",
    message: { error: "Too many requests. Please try again later." },
    hooks: {
        onDeny: function (key, result) {
            console.log("[RATE LIMITED] key=".concat(key, " retryAfter=").concat(result.retryAfter, "s"));
        },
    },
});
app.use((0, express_2.expressAdapter)(globalLimiter));
// ─── Strict rate limiter for auth endpoints ─────────────────
// 5 requests per minute per IP
var authLimiter = new ratecraft_1.RateCraft({
    algorithm: "sliding-window-counter",
    max: 5,
    window: "1m",
    statusCode: 429,
    message: { error: "Too many login attempts. Please wait before trying again." },
});
// ─── Routes ─────────────────────────────────────────────────
app.get("/", function (_req, res) {
    res.json({ message: "Welcome to RateCraft Express example!" });
});
app.get("/api/data", function (_req, res) {
    res.json({
        data: [
            { id: 1, name: "Item One" },
            { id: 2, name: "Item Two" },
            { id: 3, name: "Item Three" },
        ],
    });
});
app.post("/auth/login", (0, express_2.expressAdapter)(authLimiter), function (_req, res) {
    res.json({ message: "Login endpoint (rate limited: 5/min)" });
});
app.get("/health", function (_req, res) {
    res.json({ status: "ok" });
});
// ─── Start ──────────────────────────────────────────────────
app.listen(PORT, function () {
    console.log("Express server running at http://localhost:".concat(PORT));
    console.log("");
    console.log("Endpoints:");
    console.log("  GET  http://localhost:".concat(PORT, "/           (100 req/15min)"));
    console.log("  GET  http://localhost:".concat(PORT, "/api/data   (100 req/15min)"));
    console.log("  POST http://localhost:".concat(PORT, "/auth/login (5 req/min)"));
    console.log("  GET  http://localhost:".concat(PORT, "/health     (100 req/15min)"));
});
