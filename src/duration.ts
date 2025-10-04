export const DURATION_PATTERN = "^(?:\\d+)(?:ms|s|m)$";

const DURATION_REGEX = /^(\d+)(ms|s|m)$/;

const UNIT_MULTIPLIERS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
};

export class DurationParseError extends Error {
  constructor(value: unknown) {
    const display = typeof value === "string" ? value : String(value);
    super(`Invalid duration string: "${display}"`);
    this.name = "DurationParseError";
  }
}

export function parseDurationToMilliseconds(value: string): number {
  const match = DURATION_REGEX.exec(value);

  if (!match) {
    throw new DurationParseError(value);
  }

  const [, numeric, unit] = match;
  const amount = Number.parseInt(numeric, 10);
  const multiplier = UNIT_MULTIPLIERS[unit];

  if (!Number.isSafeInteger(amount)) {
    throw new DurationParseError(value);
  }

  return amount * multiplier;
}

export function formatMillisecondsToDuration(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError("Duration must be a non-negative finite number of milliseconds");
  }

  if (value % UNIT_MULTIPLIERS.m === 0) {
    return `${value / UNIT_MULTIPLIERS.m}m`;
  }

  if (value % UNIT_MULTIPLIERS.s === 0) {
    return `${value / UNIT_MULTIPLIERS.s}s`;
  }

  return `${value}ms`;
}

export { DURATION_PATTERN as durationPatternSource };
