import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Redis } from "ioredis";
import type { RateLimitRecord, RateLimitStore } from "../core/types";

export interface RedisStoreOptions {
  /** ioredis client instance */
  client: Redis;
  /** Key prefix. Default: "ratecraft:" */
  prefix?: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const LUA_DIR = resolve(__dirname, "../../scripts/lua");

function loadScript(name: string): string {
  return readFileSync(resolve(LUA_DIR, `${name}.lua`), "utf-8");
}

/** Loaded Lua script sources */
const SCRIPTS = {
  fixedWindow: loadScript("fixed-window"),
  tokenBucket: loadScript("token-bucket"),
  slidingWindowLog: loadScript("sliding-window-log"),
  slidingWindowCounter: loadScript("sliding-window-counter"),
};

/**
 * Redis-backed store for RateCraft.
 *
 * Uses Lua scripts for atomic operations.
 * Calls scripts via EVALSHA with EVAL fallback on NOSCRIPT errors.
 * Scripts are loaded at startup via SCRIPT LOAD.
 */
export class RedisStore implements RateLimitStore {
  private readonly client: Redis;
  private readonly prefix: string;
  private readonly scriptShas: Map<string, string> = new Map();
  private loaded = false;

  constructor(options: RedisStoreOptions) {
    this.client = options.client;
    this.prefix = options.prefix ?? "ratecraft:";
  }

  /** Load all Lua scripts into Redis and cache their SHAs. */
  async loadScripts(): Promise<void> {
    if (this.loaded) return;

    for (const [name, source] of Object.entries(SCRIPTS)) {
      const sha = (await this.client.script("LOAD", source)) as string;
      this.scriptShas.set(name, sha);
    }
    this.loaded = true;
  }

  /**
   * Execute a Lua script via EVALSHA, falling back to EVAL on NOSCRIPT.
   */
  private async evalScript(
    name: string,
    keys: string[],
    args: (string | number)[],
  ): Promise<unknown> {
    await this.loadScripts();

    const sha = this.scriptShas.get(name);
    const source = SCRIPTS[name as keyof typeof SCRIPTS];

    if (sha) {
      try {
        return await this.client.evalsha(sha, keys.length, ...keys, ...args.map(String));
      } catch (err) {
        const error = err as Error;
        if (error.message?.includes("NOSCRIPT")) {
          // Script evicted — fall back to EVAL and reload SHA
          const result = await this.client.eval(source, keys.length, ...keys, ...args.map(String));
          const newSha = (await this.client.script("LOAD", source)) as string;
          this.scriptShas.set(name, newSha);
          return result;
        }
        throw err;
      }
    }

    // No SHA cached — use EVAL directly
    return this.client.eval(source, keys.length, ...keys, ...args.map(String));
  }

  private prefixKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  /** Get the record for a key. Returns null if not found or unparseable. */
  async get(key: string): Promise<RateLimitRecord | null> {
    const data = await this.client.get(this.prefixKey(key));
    if (data === null) return null;

    try {
      return JSON.parse(data) as RateLimitRecord;
    } catch {
      return null;
    }
  }

  /** Set or update a record with the given TTL in milliseconds. */
  async set(key: string, record: RateLimitRecord, ttl: number): Promise<void> {
    await this.client.set(this.prefixKey(key), JSON.stringify(record), "PX", ttl);
  }

  /** Atomically increment the counter using Redis INCRBY. */
  async increment(key: string, amount = 1): Promise<number> {
    return this.client.incrby(this.prefixKey(key), amount);
  }

  /** Delete the record for the given key. */
  async reset(key: string): Promise<void> {
    await this.client.del(this.prefixKey(key));
  }

  /** Delete all records matching the configured prefix. */
  async resetAll(): Promise<void> {
    const keys = await this.client.keys(`${this.prefix}*`);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  /** No-op — the Redis client is managed externally. */
  async shutdown(): Promise<void> {
    // Don't close the client — it was provided externally
  }

  /** Check connectivity via Redis PING. */
  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === "PONG";
    } catch {
      return false;
    }
  }

  /**
   * Execute the fixed-window Lua script atomically.
   * @returns [allowed (0|1), remaining, ttl_ms]
   */
  async fixedWindowConsume(
    key: string,
    window: number,
    limit: number,
    now: number,
  ): Promise<[number, number, number]> {
    const result = (await this.evalScript(
      "fixedWindow",
      [this.prefixKey(key)],
      [window, limit, now],
    )) as [number, number, number];
    return result;
  }

  /**
   * Execute the token-bucket Lua script atomically.
   * @returns [allowed (0|1), remaining, resetOrRetryMs]
   */
  async tokenBucketConsume(
    key: string,
    capacity: number,
    refillRate: number,
    now: number,
    window: number,
  ): Promise<[number, number, number]> {
    const result = (await this.evalScript(
      "tokenBucket",
      [this.prefixKey(key)],
      [capacity, refillRate, now, window],
    )) as [number, number, number];
    return result;
  }

  /**
   * Execute the sliding-window-log Lua script atomically.
   * @returns [allowed (0|1), remaining, resetMs]
   */
  async slidingWindowLogConsume(
    key: string,
    now: number,
    window: number,
    limit: number,
  ): Promise<[number, number, number]> {
    const result = (await this.evalScript(
      "slidingWindowLog",
      [this.prefixKey(key)],
      [now, window, limit],
    )) as [number, number, number];
    return result;
  }

  /**
   * Execute the sliding-window-counter Lua script atomically.
   * @returns [allowed (0|1), remaining, resetMs]
   */
  async slidingWindowCounterConsume(
    currentKey: string,
    previousKey: string,
    window: number,
    limit: number,
    now: number,
    currentWindowStart: number,
  ): Promise<[number, number, number]> {
    const result = (await this.evalScript(
      "slidingWindowCounter",
      [this.prefixKey(currentKey), this.prefixKey(previousKey)],
      [window, limit, now, currentWindowStart],
    )) as [number, number, number];
    return result;
  }
}
