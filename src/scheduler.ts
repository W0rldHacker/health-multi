export interface SchedulerOptions {
  /**
   * Base interval between ticks in milliseconds.
   */
  intervalMs: number;
  /**
   * Optional lower bound (inclusive) for the jitter ratio. Defaults to 0.1 (10%).
   */
  jitterMinRatio?: number;
  /**
   * Optional upper bound (exclusive) for the jitter ratio. Must be < 1. Defaults to 0.2 (20%).
   */
  jitterMaxRatio?: number;
  /**
   * Custom random generator used to compute jitter. Defaults to Math.random.
   */
  random?: () => number;
  /**
   * Custom clock used to retrieve the current timestamp in milliseconds.
   */
  now?: () => number;
  /**
   * Optional overrides for scheduling functions (mainly for tests).
   */
  setTimeoutFn?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void;
}

export type TickHandler = (firedAt: Date) => void;

export class Scheduler {
  private readonly intervalMs: number;
  private readonly jitterMinRatio: number;
  private readonly jitterMaxRatio: number;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly setTimeoutFn: (
    callback: () => void,
    delay: number,
  ) => ReturnType<typeof setTimeout>;
  private readonly clearTimeoutFn: (handle: ReturnType<typeof setTimeout>) => void;
  private readonly tickHandlers = new Set<TickHandler>();

  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private paused = false;
  private nextPlannedAt: number | null = null;
  private remainingDelayMs: number | null = null;

  constructor(options: SchedulerOptions) {
    if (options.intervalMs <= 0) {
      throw new TypeError("intervalMs must be greater than 0");
    }

    const jitterMinRatio = options.jitterMinRatio ?? 0.1;
    const jitterMaxRatio = options.jitterMaxRatio ?? 0.2;

    if (
      jitterMinRatio < 0 ||
      jitterMaxRatio < 0 ||
      jitterMinRatio > jitterMaxRatio ||
      jitterMaxRatio >= 1
    ) {
      throw new TypeError("Invalid jitter ratio bounds: require 0 <= min <= max < 1");
    }

    this.intervalMs = options.intervalMs;
    this.jitterMinRatio = jitterMinRatio;
    this.jitterMaxRatio = jitterMaxRatio;
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
    this.setTimeoutFn = options.setTimeoutFn ?? ((cb, delay) => setTimeout(cb, delay));
    this.clearTimeoutFn = options.clearTimeoutFn ?? ((handle) => clearTimeout(handle));
  }

  /**
   * Registers a handler invoked on every tick. Returns an unsubscribe function.
   */
  onTick(handler: TickHandler): () => void {
    this.tickHandlers.add(handler);
    return () => {
      this.tickHandlers.delete(handler);
    };
  }

  /**
   * Starts the scheduler. Subsequent calls are ignored until stop() is invoked.
   */
  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.paused = false;
    this.scheduleNextTick();
  }

  /** Stops the scheduler and clears any pending tick. */
  stop(): void {
    if (!this.running) {
      return;
    }

    if (this.timer !== null) {
      this.clearTimeoutFn(this.timer);
      this.timer = null;
    }

    this.running = false;
    this.paused = false;
    this.nextPlannedAt = null;
    this.remainingDelayMs = null;
  }

  /** Pauses the scheduler while preserving the remaining time until the next tick. */
  pause(): void {
    if (!this.running || this.paused) {
      return;
    }

    this.paused = true;

    if (this.timer !== null) {
      this.clearTimeoutFn(this.timer);
      this.timer = null;
    }

    if (this.nextPlannedAt !== null) {
      const remaining = this.nextPlannedAt - this.now();
      this.remainingDelayMs = remaining > 0 ? remaining : 0;
    } else {
      this.remainingDelayMs = null;
    }
  }

  /** Resumes the scheduler using the remaining delay captured during pause(). */
  resume(): void {
    if (!this.running || !this.paused) {
      return;
    }

    this.paused = false;

    if (this.remainingDelayMs !== null) {
      const delay = this.remainingDelayMs;
      this.remainingDelayMs = null;
      this.scheduleNextTick(delay);
      return;
    }

    this.scheduleNextTick();
  }

  isRunning(): boolean {
    return this.running;
  }

  isPaused(): boolean {
    return this.paused;
  }

  private scheduleNextTick(delayOverride?: number): void {
    if (!this.running || this.paused) {
      return;
    }

    const delay = this.normalizeDelay(delayOverride ?? this.computeDelayWithJitter());
    const plannedAt = this.now() + delay;
    this.nextPlannedAt = plannedAt;

    this.timer = this.setTimeoutFn(() => {
      this.timer = null;
      this.nextPlannedAt = null;
      this.remainingDelayMs = null;

      const firedAt = new Date(this.now());
      for (const handler of Array.from(this.tickHandlers)) {
        handler(firedAt);
      }

      if (!this.running || this.paused) {
        return;
      }

      this.scheduleNextTick();
    }, delay);
  }

  private computeDelayWithJitter(): number {
    const base = this.intervalMs;
    const range = this.jitterMaxRatio - this.jitterMinRatio;
    const magnitude = this.jitterMinRatio + range * this.random();
    const sign = this.random() < 0.5 ? -1 : 1;
    const jittered = base * (1 + sign * magnitude);
    return Math.max(1, jittered);
  }

  private normalizeDelay(value: number): number {
    const rounded = Math.max(0, Math.round(value));
    return rounded;
  }
}
