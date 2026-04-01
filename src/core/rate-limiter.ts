import { MemoryStore } from "../stores/memory";
import { parseDuration } from "../utils/parse-duration";
import { FixedWindow } from "./algorithms/fixed-window";
import { SlidingWindowCounter } from "./algorithms/sliding-window-counter";
import { SlidingWindowLog } from "./algorithms/sliding-window-log";
import { TokenBucket } from "./algorithms/token-bucket";
import { ConfigError } from "./errors";
import type {
  AlgorithmType,
  RateCraftHooks,
  RateCraftOptions,
  RateLimitAlgorithm,
  RateLimitResult,
  RateLimitStore,
} from "./types";

/** Resolved options where all optional fields have defaults applied. */
interface ResolvedOptions {
  algorithm: AlgorithmType;
  max: number;
  window: number;
  store: RateLimitStore;
  keyGenerator: (req: unknown) => string;
  statusCode: number;
  message: string | Record<string, unknown>;
  headers: boolean;
  legacyHeaders: boolean;
  skip: (req: unknown) => boolean | Promise<boolean>;
  onRateLimited: (req: unknown, result: RateLimitResult) => void;
  failStrategy: "open" | "closed";
  fallbackStore: RateLimitStore | undefined;
  hooks: RateCraftHooks;
}

/**
 * Main RateCraft class.
 *
 * Framework-agnostic rate limiter that can be used directly
 * or through framework adapters (Express, Fastify, Hono).
 */
export class RateCraft {
  private readonly algorithm: RateLimitAlgorithm;
  private readonly store: RateLimitStore;
  private readonly resolvedOptions: ResolvedOptions;

  constructor(options: RateCraftOptions) {
    const windowMs =
      typeof options.window === "string" ? parseDuration(options.window) : options.window;

    if (!Number.isFinite(options.max) || options.max <= 0) {
      throw new ConfigError(`Expected 'max' to be a positive integer, received: ${options.max}`);
    }

    if (!Number.isFinite(windowMs) || windowMs <= 0) {
      throw new ConfigError(
        `Expected 'window' to be a positive duration, received: ${options.window}`,
      );
    }

    this.resolvedOptions = {
      algorithm: options.algorithm ?? "token-bucket",
      max: options.max,
      window: windowMs,
      store: options.store ?? new MemoryStore(),
      keyGenerator:
        options.keyGenerator ??
        ((req: unknown) => ((req as Record<string, unknown>).ip as string) ?? "unknown"),
      statusCode: options.statusCode ?? 429,
      message: options.message ?? { error: "Too Many Requests" },
      headers: options.headers ?? true,
      legacyHeaders: options.legacyHeaders ?? false,
      skip: options.skip ?? (() => false),
      onRateLimited: options.onRateLimited ?? (() => {}),
      failStrategy: options.failStrategy ?? "open",
      fallbackStore: options.fallbackStore ?? undefined,
      hooks: options.hooks ?? {},
    };

    this.algorithm = this.createAlgorithm(this.resolvedOptions.algorithm);
    this.store = this.resolvedOptions.store;
  }

  /**
   * Evaluate rate limit for a key.
   * Framework-agnostic — can be used directly.
   */
  async consume(key: string): Promise<RateLimitResult> {
    try {
      const result = await this.algorithm.consume(key, this.store, {
        max: this.resolvedOptions.max,
        window: this.resolvedOptions.window,
      });

      if (result.allowed) {
        this.resolvedOptions.hooks.onAllow?.(key, result);
      } else {
        this.resolvedOptions.hooks.onDeny?.(key, result);
      }

      return result;
    } catch (error) {
      this.resolvedOptions.hooks.onError?.(error as Error, key);

      // Try fallback store if available
      if (this.resolvedOptions.fallbackStore) {
        try {
          this.resolvedOptions.hooks.onFallback?.(error as Error, "fallback");
          return await this.algorithm.consume(key, this.resolvedOptions.fallbackStore, {
            max: this.resolvedOptions.max,
            window: this.resolvedOptions.window,
          });
        } catch {
          // Fallback also failed — fall through to failStrategy
        }
      }

      // Apply failStrategy
      if (this.resolvedOptions.failStrategy === "closed") {
        return {
          allowed: false,
          remaining: 0,
          limit: this.resolvedOptions.max,
          resetIn: 0,
          resetAt: Date.now(),
          retryAfter: 1,
        };
      }

      return {
        allowed: true,
        remaining: this.resolvedOptions.max,
        limit: this.resolvedOptions.max,
        resetIn: 0,
        resetAt: Date.now(),
        retryAfter: 0,
      };
    }
  }

  /**
   * Reset the rate limit counter for a key.
   */
  async reset(key: string): Promise<void> {
    return this.store.reset(key);
  }

  /**
   * Shut down the store (connection cleanup).
   */
  async shutdown(): Promise<void> {
    return this.store.shutdown?.();
  }

  /** Get resolved options — used by adapters. */
  getOptions(): ResolvedOptions {
    return this.resolvedOptions;
  }

  private createAlgorithm(type: AlgorithmType): RateLimitAlgorithm {
    switch (type) {
      case "token-bucket":
        return new TokenBucket();
      case "fixed-window":
        return new FixedWindow();
      case "sliding-window-counter":
        return new SlidingWindowCounter();
      case "sliding-window-log":
        return new SlidingWindowLog();
      default:
        throw new ConfigError(
          `Unknown algorithm: "${type}". Expected one of: token-bucket, fixed-window, sliding-window-counter, sliding-window-log`,
        );
    }
  }
}
