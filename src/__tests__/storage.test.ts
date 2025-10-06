import { describe, expect, it } from "vitest";

import { type NormalizedStatus } from "../domain";
import {
  ObservationStore,
  aggregateObservations,
  computeAggregateStatus,
  computeLatencyPercentiles,
  type ServiceObservation,
} from "../storage";

function makeObservation(
  overrides: Partial<ServiceObservation> & Pick<ServiceObservation, "serviceName" | "status">,
): ServiceObservation {
  return {
    httpStatus: 200,
    latencyMs: 120,
    checkedAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("ObservationStore", () => {
  it("keeps only the most recent N observations per service", () => {
    const store = new ObservationStore(2);

    store.add(
      makeObservation({
        serviceName: "api",
        status: "ok",
        latencyMs: 50,
        checkedAt: new Date("2024-01-01T00:00:00.000Z"),
      }),
    );

    store.add(
      makeObservation({
        serviceName: "api",
        status: "degraded",
        latencyMs: 60,
        checkedAt: new Date("2024-01-01T00:00:01.000Z"),
      }),
    );

    store.add(
      makeObservation({
        serviceName: "api",
        status: "down",
        latencyMs: 70,
        checkedAt: new Date("2024-01-01T00:00:02.000Z"),
      }),
    );

    const history = store.getHistory("api");

    expect(history).toHaveLength(2);
    expect(history[0]?.status).toBe<NormalizedStatus>("degraded");
    expect(history[1]?.status).toBe<NormalizedStatus>("down");
  });
});

describe("computeAggregateStatus", () => {
  it("returns down when any result is down", () => {
    const status = computeAggregateStatus([
      { status: "ok" },
      { status: "degraded" },
      { status: "down" },
    ]);

    expect(status).toBe<NormalizedStatus>("down");
  });

  it("returns degraded when results contain degraded but no down", () => {
    const status = computeAggregateStatus([{ status: "ok" }, { status: "degraded" }]);

    expect(status).toBe<NormalizedStatus>("degraded");
  });

  it("returns ok when all results are ok", () => {
    const status = computeAggregateStatus([{ status: "ok" }, { status: "ok" }]);

    expect(status).toBe<NormalizedStatus>("ok");
  });
});

describe("computeLatencyPercentiles", () => {
  it("ignores missing latencies", () => {
    const percentiles = computeLatencyPercentiles([
      { latencyMs: 50 },
      { latencyMs: undefined },
      { latencyMs: 100 },
    ]);

    expect(percentiles).toEqual({
      p50: 75,
      p95: 97.5,
      p99: 99.5,
    });
  });

  it("returns an empty summary when latencies are unavailable", () => {
    const percentiles = computeLatencyPercentiles([{ latencyMs: undefined }]);

    expect(percentiles).toEqual({});
  });
});

describe("aggregateObservations", () => {
  it("enriches snapshots with metadata and percentiles", () => {
    const store = new ObservationStore(3);
    const startedAt = new Date("2024-01-01T00:00:00.000Z");
    const completedAt = new Date("2024-01-01T00:05:00.000Z");

    store.add(
      makeObservation({
        serviceName: "api",
        status: "ok",
        latencyMs: 30,
        version: "1.0.0",
        region: "eu-west-1",
        checkedAt: new Date("2024-01-01T00:04:59.000Z"),
      }),
    );

    store.add(
      makeObservation({
        serviceName: "billing",
        status: "degraded",
        latencyMs: 90,
        error: new Error("timeout"),
        checkedAt: new Date("2024-01-01T00:04:30.000Z"),
      }),
    );

    const aggregate = aggregateObservations(store, startedAt, completedAt);

    expect(aggregate.status).toBe<NormalizedStatus>("degraded");
    expect(aggregate.latency.p50).toBeCloseTo(60);
    expect(aggregate.latency.p95).toBeCloseTo(87);
    expect(aggregate.latency.p99).toBeCloseTo(89.4);

    const apiSnapshot = aggregate.services.find((item) => item.serviceName === "api");
    expect(apiSnapshot?.metadata).toEqual({
      ageMs: 1000,
      version: "1.0.0",
      region: "eu-west-1",
      error: undefined,
    });

    const billingSnapshot = aggregate.services.find((item) => item.serviceName === "billing");
    expect(billingSnapshot?.metadata?.ageMs).toBe(30000);
    expect(billingSnapshot?.metadata?.error).toBeInstanceOf(Error);
  });
});
