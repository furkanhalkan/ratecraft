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
 * @throws Error if the format is invalid
 */
export function parseDuration(duration: string | number): number {
  if (typeof duration === "number") {
    if (duration <= 0 || !Number.isFinite(duration)) {
      throw new Error(`Invalid duration: expected a positive finite number, received: ${duration}`);
    }
    return duration;
  }

  const match = DURATION_REGEX.exec(duration);
  if (!match) {
    throw new Error(
      `Invalid duration format: "${duration}". Expected format: <number><unit> where unit is s, m, h, or d (e.g. "15m", "1h", "30s")`,
    );
  }

  const value = Number(match[1]);
  const unit = match[2] as string;
  const multiplier = MULTIPLIERS[unit];

  if (multiplier === undefined) {
    throw new Error(
      `Invalid duration format: "${duration}". Expected format: <number><unit> where unit is s, m, h, or d (e.g. "15m", "1h", "30s")`,
    );
  }

  if (value <= 0) {
    throw new Error(`Invalid duration: expected a positive value, received: "${duration}"`);
  }

  return value * multiplier;
}
