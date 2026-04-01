// ============================================================
// ALGORITHM TYPES
// ============================================================

export type AlgorithmType =
  | "token-bucket"
  | "sliding-window-log"
  | "sliding-window-counter"
  | "fixed-window";

// ============================================================
// RATE LIMIT RESULT
// ============================================================

export interface RateLimitResult {
  /** Whether the request was allowed */
  allowed: boolean;
  /** Remaining request quota */
  remaining: number;
  /** Total limit */
  limit: number;
  /** Milliseconds until the window resets */
  resetIn: number;
  /** Window reset time (Unix timestamp ms) */
  resetAt: number;
  /** Retry-After value (seconds). Only meaningful when allowed=false */
  retryAfter: number;
}

// ============================================================
// STORE INTERFACE
// ============================================================

export interface RateLimitRecord {
  /** Current counter or token value */
  count: number;
  /** Record creation time (Unix timestamp ms) */
  createdAt: number;
  /** Record last update time (Unix timestamp ms) */
  updatedAt: number;
  /** Algorithm-specific extra data (JSON serializable) */
  metadata?: Record<string, unknown>;
}

export interface RateLimitStore {
  /**
   * Get the current record for a key.
   * Returns null if the key does not exist.
   */
  get(key: string): Promise<RateLimitRecord | null>;

  /**
   * Set or update the record for a key.
   * @param ttl - Auto-delete time for the record (ms)
   */
  set(key: string, record: RateLimitRecord, ttl: number): Promise<void>;

  /**
   * Atomically increment the counter for a key.
   * If the key does not exist, create it with value 1.
   * Returns the new value.
   */
  increment(key: string, amount?: number): Promise<number>;

  /**
   * Reset (delete) a key.
   */
  reset(key: string): Promise<void>;

  /**
   * Reset all keys.
   */
  resetAll?(): Promise<void>;

  /**
   * Shut down the store (connection cleanup).
   */
  shutdown?(): Promise<void>;

  /**
   * Check if the store is accessible.
   */
  isHealthy?(): Promise<boolean>;
}

// ============================================================
// ALGORITHM INTERFACE
// ============================================================

export interface RateLimitAlgorithm {
  /**
   * Evaluate a request.
   * @param key - Unique key identifying the request (IP, user ID, etc.)
   * @param store - Data storage layer
   * @param options - Algorithm configuration
   * @returns RateLimitResult
   */
  consume(key: string, store: RateLimitStore, options: AlgorithmOptions): Promise<RateLimitResult>;
}

export interface AlgorithmOptions {
  /** Maximum number of requests per window */
  max: number;
  /** Window duration (ms) */
  window: number;
}

// ============================================================
// MAIN CONFIG
// ============================================================

export interface RateCraftOptions {
  /** Algorithm to use */
  algorithm?: AlgorithmType;
  /** Maximum number of requests per window */
  max: number;
  /** Window duration. String ("15m", "1h") or number (ms) */
  window: string | number;
  /** Store to use. Default: MemoryStore */
  store?: RateLimitStore;
  /** Key generator for identifying requests */
  keyGenerator?: (req: unknown) => string;
  /** HTTP status code when rate limited. Default: 429 */
  statusCode?: number;
  /** Message returned when rate limited */
  message?: string | Record<string, unknown>;
  /** Add rate limit headers. Default: true */
  headers?: boolean;
  /** Also add legacy X-RateLimit headers. Default: false */
  legacyHeaders?: boolean;
  /** Skip certain requests */
  skip?: (req: unknown) => boolean | Promise<boolean>;
  /** Custom handler called when rate limited */
  onRateLimited?: (req: unknown, result: RateLimitResult) => void;
  /** Strategy when store fails. Default: 'open' (allow) */
  failStrategy?: "open" | "closed";
  /** Fallback store (optional). Used when the main store fails */
  fallbackStore?: RateLimitStore;
  /** Event hooks */
  hooks?: RateCraftHooks;
}

// ============================================================
// EVENT HOOKS
// ============================================================

export interface RateCraftHooks {
  /** Called when a request is allowed */
  onAllow?: (key: string, result: RateLimitResult) => void;
  /** Called when a request is denied */
  onDeny?: (key: string, result: RateLimitResult) => void;
  /** Called when a store error occurs */
  onError?: (error: Error, key: string) => void;
  /** Called when the store falls back */
  onFallback?: (error: Error, fallbackStore: string) => void;
}

// ============================================================
// ADAPTER TYPES
// ============================================================

export interface AdapterRequest {
  ip: string;
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface AdapterResponse {
  setHeader(name: string, value: string | number): void;
  status(code: number): void;
  send(body: string | Record<string, unknown>): void;
}
