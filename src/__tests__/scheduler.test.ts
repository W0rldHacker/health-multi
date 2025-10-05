import { describe, expect, it, vi } from "vitest";

import { Scheduler } from "../scheduler";

describe("Scheduler", () => {
  it("emits ticks with jitter between ±10-20% of the interval", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const randomValues = [0, 0, 0.5, 0.75];
    const scheduler = new Scheduler({
      intervalMs: 1_000,
      random: () => {
        const value = randomValues.shift();
        return value === undefined ? 0.5 : value;
      },
    });

    const tickTimes: number[] = [];
    scheduler.onTick(() => {
      tickTimes.push(Date.now());
    });

    scheduler.start();

    vi.advanceTimersByTime(899);
    expect(tickTimes).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(tickTimes).toEqual([900]);

    vi.advanceTimersByTime(1_149);
    expect(tickTimes).toEqual([900]);

    vi.advanceTimersByTime(1);
    expect(tickTimes).toEqual([900, 2_050]);

    const intervals = tickTimes.slice(1).map((time, index) => time - tickTimes[index]);
    expect(intervals[0]).toBe(1_150);
    expect(intervals[0]).toBeGreaterThanOrEqual(1_000 * 1.1);
    expect(intervals[0]).toBeLessThanOrEqual(1_000 * 1.2);
  });

  it("pauses and resumes while preserving the remaining delay", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const randomValues = [0, 0, 0.5, 0.75];
    const scheduler = new Scheduler({
      intervalMs: 1_000,
      random: () => {
        const value = randomValues.shift();
        return value === undefined ? 0.5 : value;
      },
    });

    const tickTimes: number[] = [];
    scheduler.onTick(() => {
      tickTimes.push(Date.now());
    });

    scheduler.start();
    vi.advanceTimersByTime(400);

    scheduler.pause();
    expect(scheduler.isPaused()).toBe(true);

    vi.advanceTimersByTime(1_000);
    expect(tickTimes).toHaveLength(0);

    scheduler.resume();
    expect(scheduler.isPaused()).toBe(false);
    const resumedAt = Date.now();

    vi.advanceTimersByTime(499);
    expect(tickTimes).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(tickTimes).toHaveLength(1);
    expect(tickTimes[0] - resumedAt).toBe(500);

    vi.advanceTimersByTime(1_149);
    expect(tickTimes).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(tickTimes).toEqual([resumedAt + 500, resumedAt + 500 + 1_150]);
  });

  it("supports unsubscribing tick handlers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const scheduler = new Scheduler({
      intervalMs: 500,
      random: () => 0.5,
    });

    const calls: number[] = [];
    const unsubscribe = scheduler.onTick(() => {
      calls.push(Date.now());
    });

    scheduler.start();

    vi.advanceTimersByTime(450);
    unsubscribe();
    vi.advanceTimersByTime(1_000);

    expect(calls.length).toBeLessThanOrEqual(1);
  });
});
