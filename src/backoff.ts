export interface ExponentialBackoffOptions {
  /**
   * Delay applied before the first retry attempt in milliseconds.
   */
  initialDelayMs: number;
  /**
   * Growth factor applied on every subsequent retry. Defaults to 2 (doubling).
   */
  factor?: number;
  /**
   * Optional cap for the computed delay in milliseconds.
   */
  maxDelayMs?: number;
  /**
   * Optional lower bound (inclusive) for the jitter ratio. Defaults to 0.05 (5%).
   */
  jitterMinRatio?: number;
  /**
   * Optional upper bound (exclusive) for the jitter ratio. Must be < 1. Defaults to 0.15 (15%).
   */
  jitterMaxRatio?: number;
  /**
   * Custom random generator used to compute jitter. Defaults to Math.random.
   */
  random?: () => number;
}

function validatePositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a finite number greater than 0`);
  }
}

function applyJitter(
  value: number,
  random: () => number,
  jitterMinRatio: number,
  jitterMaxRatio: number,
): number {
  const range = jitterMaxRatio - jitterMinRatio;

  if (range <= 0) {
    return value;
  }

  const magnitude = jitterMinRatio + range * random();
  const sign = random() < 0.5 ? -1 : 1;
  const jittered = value * (1 + sign * magnitude);

  return Math.max(1, jittered);
}

export class ExponentialBackoff {
  private readonly initialDelayMs: number;
  private readonly factor: number;
  private readonly maxDelayMs?: number;
  private readonly jitterMinRatio: number;
  private readonly jitterMaxRatio: number;
  private readonly random: () => number;

  private attempt = 0;

  constructor(options: ExponentialBackoffOptions) {
    validatePositiveFinite("initialDelayMs", options.initialDelayMs);

    const factor = options.factor ?? 2;
    if (!Number.isFinite(factor) || factor <= 1) {
      throw new TypeError("factor must be a finite number greater than 1");
    }

    if (options.maxDelayMs !== undefined) {
      validatePositiveFinite("maxDelayMs", options.maxDelayMs);
      if (options.maxDelayMs < options.initialDelayMs) {
        throw new TypeError("maxDelayMs must be greater than or equal to initialDelayMs");
      }
    }

    const jitterMinRatio = options.jitterMinRatio ?? 0.05;
    const jitterMaxRatio = options.jitterMaxRatio ?? 0.15;

    if (
      jitterMinRatio < 0 ||
      jitterMaxRatio < 0 ||
      jitterMinRatio > jitterMaxRatio ||
      jitterMaxRatio >= 1
    ) {
      throw new TypeError("Invalid jitter ratio bounds: require 0 <= min <= max < 1");
    }

    this.initialDelayMs = options.initialDelayMs;
    this.factor = factor;
    this.maxDelayMs = options.maxDelayMs;
    this.jitterMinRatio = jitterMinRatio;
    this.jitterMaxRatio = jitterMaxRatio;
    this.random = options.random ?? Math.random;
  }

  /**
   * Returns the next delay in the backoff sequence, applying jitter.
   */
  nextDelay(): number {
    this.attempt += 1;
    return this.computeDelayForAttempt(this.attempt);
  }

  /**
   * Resets the internal attempt counter to the initial state.
   */
  reset(): void {
    this.attempt = 0;
  }

  private computeDelayForAttempt(attempt: number): number {
    const exponent = attempt - 1;
    const exponential = this.initialDelayMs * Math.pow(this.factor, exponent);
    const jittered = applyJitter(
      exponential,
      this.random,
      this.jitterMinRatio,
      this.jitterMaxRatio,
    );
    const cappedAfterJitter = this.maxDelayMs ? Math.min(jittered, this.maxDelayMs) : jittered;

    return Math.round(cappedAfterJitter);
  }
}

interface ServiceState {
  levelIndex: number;
}

export interface ServiceBackoffOptions {
  /**
   * Maximum multiplier applied to the base interval. Defaults to 4.
   */
  maxMultiplier?: number;
  /**
   * Growth factor between levels. Defaults to 2.
   */
  growthFactor?: number;
}

function buildMultiplierLevels(maxMultiplier: number, growthFactor: number): number[] {
  const levels: number[] = [1];

  let current = 1;

  while (current < maxMultiplier) {
    const next = Math.min(maxMultiplier, current * growthFactor);
    if (next === current) {
      break;
    }

    levels.push(next);
    current = next;
  }

  return levels;
}

export class ServiceBackoff {
  private readonly multipliers: number[];
  private readonly state = new Map<string, ServiceState>();

  constructor(options: ServiceBackoffOptions = {}) {
    const maxMultiplier = options.maxMultiplier ?? 4;
    const growthFactor = options.growthFactor ?? 2;

    validatePositiveFinite("maxMultiplier", maxMultiplier);
    if (maxMultiplier < 1) {
      throw new TypeError("maxMultiplier must be greater than or equal to 1");
    }
    if (!Number.isFinite(growthFactor) || growthFactor <= 1) {
      throw new TypeError("growthFactor must be a finite number greater than 1");
    }

    this.multipliers = buildMultiplierLevels(maxMultiplier, growthFactor);
  }

  /**
   * Returns the multiplier that should be applied to the base interval for a service.
   */
  getMultiplier(serviceName: string): number {
    const state = this.state.get(serviceName);
    return state ? this.multipliers[state.levelIndex] : this.multipliers[0];
  }

  /**
   * Records a failure for the provided service and returns the updated multiplier.
   */
  recordFailure(serviceName: string): number {
    const previous = this.state.get(serviceName);
    const nextIndex = Math.min((previous?.levelIndex ?? 0) + 1, this.multipliers.length - 1);
    this.state.set(serviceName, { levelIndex: nextIndex });
    return this.multipliers[nextIndex];
  }

  /**
   * Records a successful probe for the service, resetting its multiplier to the base level.
   */
  recordSuccess(serviceName: string): void {
    this.state.delete(serviceName);
  }

  /**
   * Clears all stored backoff state, resetting every service to the base multiplier.
   */
  resetAll(): void {
    this.state.clear();
  }
}
