import { ConfigError, ErrorCode } from "../core/errors";

const DURATION_REGEX = /^(\d+)(s|m|h|d)$/;

const MULTIPLIERS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Parse a duration string into milliseconds.
 *
 * Supported formats:
 * - `"1s"`  → 1000
 * - `"30s"` → 30000
 * - `"5m"`  → 300000
 * - `"15m"` → 900000
 * - `"1h"`  → 3600000
 * - `"1d"`  → 86400000
 *
 * @param duration - Duration string (e.g. "15m", "1h", "30s") or number (ms)
 * @returns Duration in milliseconds
 * @throws ConfigError if the format is invalid
 */
export function parseDuration(duration: string | number): number {
  if (typeof duration === "number") {
    if (duration <= 0 || !Number.isFinite(duration)) {
      throw new ConfigError(
        `Invalid duration: expected a positive finite number, received ${duration}.`,
        ErrorCode.INVALID_DURATION,
      );
    }
    return duration;
  }

  const match = DURATION_REGEX.exec(duration);
  if (!match) {
    throw new ConfigError(
      `Invalid duration format: "${duration}".\n  → Expected format: <number><unit> (e.g. "30s", "5m", "1h", "1d")`,
      ErrorCode.INVALID_DURATION,
    );
  }

  const value = Number(match[1]);
  const unit = match[2] as string;
  const multiplier = MULTIPLIERS[unit];

  if (multiplier === undefined) {
    throw new ConfigError(
      `Invalid duration unit in "${duration}".\n  → Supported units: s (seconds), m (minutes), h (hours), d (days)`,
      ErrorCode.INVALID_DURATION,
    );
  }

  if (value <= 0) {
    throw new ConfigError(
      `Invalid duration: expected a positive value, received "${duration}".`,
      ErrorCode.INVALID_DURATION,
    );
  }

  return value * multiplier;
}
