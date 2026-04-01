/**
 * Base error class for all RateCraft errors.
 */
export class RateCraftError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "RateCraftError";
  }
}

/**
 * Thrown when a store operation fails (Redis down, Memcached timeout, etc.).
 */
export class StoreError extends RateCraftError {
  constructor(
    message: string,
    public readonly originalError: Error,
  ) {
    super(message, "STORE_ERROR");
    this.name = "StoreError";
  }
}

/**
 * Thrown when the configuration is invalid.
 */
export class ConfigError extends RateCraftError {
  constructor(message: string) {
    super(message, "CONFIG_ERROR");
    this.name = "ConfigError";
  }
}
