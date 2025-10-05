import { describe, expect, it } from "vitest";

import { ExponentialBackoff, ServiceBackoff } from "../backoff";

describe("ExponentialBackoff", () => {
  it("produces doubling delays without jitter when disabled", () => {
    const backoff = new ExponentialBackoff({
      initialDelayMs: 200,
      jitterMinRatio: 0,
      jitterMaxRatio: 0,
    });

    expect(backoff.nextDelay()).toBe(200);
    expect(backoff.nextDelay()).toBe(400);
    expect(backoff.nextDelay()).toBe(800);

    backoff.reset();
    expect(backoff.nextDelay()).toBe(200);
  });

  it("applies bounded jitter to the computed delay", () => {
    const randomValues = [0, 0.75, 0.25, 0.25];
    const backoff = new ExponentialBackoff({
      initialDelayMs: 200,
      maxDelayMs: 1_600,
      random: () => {
        const value = randomValues.shift();
        return value === undefined ? 0.5 : value;
      },
    });

    const first = backoff.nextDelay();
    const second = backoff.nextDelay();
    const third = backoff.nextDelay();

    expect(first).toBeGreaterThanOrEqual(170);
    expect(first).toBeLessThanOrEqual(230);

    expect(second).toBeGreaterThanOrEqual(340);
    expect(second).toBeLessThanOrEqual(460);

    expect(third).toBeGreaterThanOrEqual(680);
    expect(third).toBeLessThanOrEqual(920);
  });
});

describe("ServiceBackoff", () => {
  it("escalates multipliers on failures and resets on success", () => {
    const backoff = new ServiceBackoff();

    expect(backoff.getMultiplier("svc")).toBe(1);
    expect(backoff.recordFailure("svc")).toBe(2);
    expect(backoff.getMultiplier("svc")).toBe(2);
    expect(backoff.recordFailure("svc")).toBe(4);
    expect(backoff.recordFailure("svc")).toBe(4);

    backoff.recordSuccess("svc");
    expect(backoff.getMultiplier("svc")).toBe(1);
  });

  it("honours a configurable maximum multiplier", () => {
    const backoff = new ServiceBackoff({ maxMultiplier: 2 });

    expect(backoff.recordFailure("svc")).toBe(2);
    expect(backoff.recordFailure("svc")).toBe(2);
  });
});
