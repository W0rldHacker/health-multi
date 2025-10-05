import { ExponentialBackoff, type ExponentialBackoffOptions } from "./backoff";

export interface RetryOptions {
  /**
   * Maximum number of retry attempts that should be performed after the initial attempt.
   */
  retries: number;
  /**
   * Options used to construct the exponential backoff sequence for retry delays.
   */
  backoff: ExponentialBackoffOptions;
  /**
   * Optional predicate that determines whether a particular error should be retried.
   * Receives the thrown error and the attempt number that just failed.
   */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /**
   * Optional custom wait strategy primarily used for tests. Receives the computed
   * delay and the next attempt number that will be executed once the promise resolves.
   */
  wait?: (delayMs: number, nextAttempt: number) => Promise<void>;
}

export type RetryableOperation<T> = (attempt: number) => Promise<T>;

function normalizeRetries(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError("retries must be a finite non-negative number");
  }

  return Math.floor(value);
}

async function defaultWait(delayMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export async function retryOperation<T>(
  operation: RetryableOperation<T>,
  options: RetryOptions,
): Promise<T> {
  const retries = normalizeRetries(options.retries);
  const shouldRetry = options.shouldRetry ?? (() => true);
  const wait = options.wait ?? ((delay) => defaultWait(delay));
  const backoff = new ExponentialBackoff(options.backoff);
  const totalAttempts = retries + 1;

  let attempt = 0;
  let lastError: unknown;

  while (attempt < totalAttempts) {
    attempt += 1;

    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;

      if (!shouldRetry(error, attempt) || attempt === totalAttempts) {
        throw error instanceof Error ? error : new Error(String(error));
      }

      const delay = backoff.nextDelay();
      await wait(delay, attempt + 1);
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("retryOperation exhausted without an error");
}
