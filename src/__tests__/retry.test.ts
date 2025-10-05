import { describe, expect, it, vi } from "vitest";

import { retryOperation } from "../retry";

function createVirtualWait(
  delays: number[],
): (delayMs: number, nextAttempt: number) => Promise<void> {
  return (delayMs) => {
    delays.push(delayMs);
    return new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  };
}

describe("retryOperation", () => {
  it("does not perform retries when retries is set to 0", async () => {
    vi.useFakeTimers();

    try {
      const error = new Error("boom");
      const operation = vi.fn<(attempt: number) => Promise<never>>().mockRejectedValue(error);
      const waitCalls: number[] = [];

      const promise = retryOperation(operation, {
        retries: 0,
        backoff: {
          initialDelayMs: 200,
          jitterMinRatio: 0,
          jitterMaxRatio: 0,
        },
        wait: createVirtualWait(waitCalls),
      });
      const guarded = promise.catch(() => {});

      await expect(promise).rejects.toBe(error);
      await guarded;

      expect(operation).toHaveBeenCalledTimes(1);
      expect(waitCalls).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("performs the configured number of retries with exponential backoff", async () => {
    vi.useFakeTimers();

    try {
      const error = new Error("persistent failure");
      const operation = vi.fn<(attempt: number) => Promise<never>>().mockRejectedValue(error);
      const scheduledDelays: number[] = [];

      const promise = retryOperation(operation, {
        retries: 3,
        backoff: {
          initialDelayMs: 200,
          jitterMinRatio: 0,
          jitterMaxRatio: 0,
        },
        wait: createVirtualWait(scheduledDelays),
      });
      const guarded = promise.catch(() => {});

      expect(operation).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(200);
      expect(operation).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(400);
      expect(operation).toHaveBeenCalledTimes(3);

      await vi.advanceTimersByTimeAsync(800);
      await expect(promise).rejects.toBe(error);
      await guarded;
      expect(operation).toHaveBeenCalledTimes(4);

      expect(scheduledDelays).toEqual([200, 400, 800]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops retrying once the operation succeeds after transient failures", async () => {
    vi.useFakeTimers();

    try {
      const error = new Error("intermittent");
      const operation = vi
        .fn<(attempt: number) => Promise<string>>()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue("ok");
      const scheduledDelays: number[] = [];

      const promise = retryOperation(operation, {
        retries: 5,
        backoff: {
          initialDelayMs: 200,
          jitterMinRatio: 0,
          jitterMaxRatio: 0,
        },
        wait: createVirtualWait(scheduledDelays),
      });
      const guarded = promise.catch(() => {});

      expect(operation).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(200);
      expect(operation).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(400);
      await expect(promise).resolves.toBe("ok");
      await guarded;
      expect(operation).toHaveBeenCalledTimes(3);

      expect(scheduledDelays).toEqual([200, 400]);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
