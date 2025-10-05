import pLimit, { type LimitFunction } from "p-limit";

export type ConcurrencyLimiter = LimitFunction;

const noop = () => {};

function createUnlimitedLimiter(): ConcurrencyLimiter {
  let activeCount = 0;

  const limiter = (async <Arguments extends unknown[], ReturnType>(
    fn: (...args: Arguments) => PromiseLike<ReturnType> | ReturnType,
    ...args: Arguments
  ): Promise<ReturnType> => {
    activeCount += 1;
    try {
      return await fn(...args);
    } finally {
      activeCount -= 1;
    }
  }) as ConcurrencyLimiter;

  Object.defineProperties(limiter, {
    activeCount: {
      enumerable: true,
      get: () => activeCount,
    },
    pendingCount: {
      enumerable: true,
      get: () => 0,
    },
  });

  limiter.clearQueue = noop;

  return limiter;
}

export function createConcurrencyLimiter(limit?: number | null): ConcurrencyLimiter {
  if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
    return pLimit(limit);
  }

  return createUnlimitedLimiter();
}
