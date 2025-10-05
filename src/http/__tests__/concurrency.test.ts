import { describe, expect, it } from "vitest";

import { createConcurrencyLimiter, type ConcurrencyLimiter } from "../concurrency";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("createConcurrencyLimiter", () => {
  it("respects the provided concurrency limit", async () => {
    const limit: ConcurrencyLimiter = createConcurrencyLimiter(1);
    const order: number[] = [];

    const results = await Promise.all([
      limit(async () => {
        order.push(1);
        await sleep(10);
        order.push(2);
        return "first";
      }),
      limit(async () => {
        await Promise.resolve();
        order.push(3);
        return "second";
      }),
    ]);

    expect(order).toEqual([1, 2, 3]);
    expect(results).toEqual(["first", "second"]);
    expect(limit.activeCount).toBe(0);
    expect(limit.pendingCount).toBe(0);
  });

  it("falls back to an unlimited limiter when limit is not positive", async () => {
    const limiter: ConcurrencyLimiter = createConcurrencyLimiter(0);
    const order: number[] = [];

    await Promise.all([
      limiter(async () => {
        order.push(1);
        await sleep(5);
      }),
      limiter(async () => {
        await Promise.resolve();
        order.push(2);
      }),
    ]);

    expect(order).toHaveLength(2);
    expect(order).toContain(1);
    expect(order).toContain(2);
    expect(limiter.activeCount).toBe(0);
    expect(limiter.pendingCount).toBe(0);
  });
});
