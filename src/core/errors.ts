// ============================================================
// ERROR CODES
// ============================================================

export const ErrorCode = {
  // Configuration errors
  INVALID_MAX: "ERR_INVALID_MAX",
  INVALID_WINDOW: "ERR_INVALID_WINDOW",
  INVALID_DURATION: "ERR_INVALID_DURATION",
  INVALID_STATUS_CODE: "ERR_INVALID_STATUS_CODE",
  UNKNOWN_ALGORITHM: "ERR_UNKNOWN_ALGORITHM",

  // Store errors
  STORE_ERROR: "ERR_STORE",
  STORE_GET_FAILED: "ERR_STORE_GET_FAILED",
  STORE_SET_FAILED: "ERR_STORE_SET_FAILED",
  STORE_INCREMENT_FAILED: "ERR_STORE_INCREMENT_FAILED",
  STORE_CONNECTION: "ERR_STORE_CONNECTION",
  STORE_PARSE: "ERR_STORE_PARSE",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// ============================================================
// ERROR CLASSES
// ============================================================

/**
 * Base error class for all RateCraft errors.
 *
 * Supports the ES2022 `cause` property for error chaining.
 */
export class RateCraftError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    options?: { cause?: unknown },
  ) {
    super(`[RateCraft] ${message}`, options);
    this.name = "RateCraftError";
  }
}

/**
 * Thrown when a store operation fails (Redis down, Memcached timeout, etc.).
 */
export class StoreError extends RateCraftError {
  constructor(
    message: string,
    public readonly storeName: string,
    public readonly originalError: Error,
    code: ErrorCode = ErrorCode.STORE_ERROR,
  ) {
    super(`${storeName} store error: ${message}`, code, { cause: originalError });
    this.name = "StoreError";
  }
}

/**
 * Thrown when the configuration is invalid.
 */
export class ConfigError extends RateCraftError {
  constructor(message: string, code: ErrorCode = ErrorCode.INVALID_MAX) {
    super(message, code);
    this.name = "ConfigError";
  }
}
