import { describe, expect, it } from "vitest";

import { type AggregateResult } from "../domain";
import { serializeAggregateResultToPrometheusTextfile } from "../prometheus-textfile";

function createAggregateResult(): AggregateResult {
  const completedAt = new Date("2025-09-01T10:15:00.000Z");

  return {
    status: "degraded",
    startedAt: new Date("2025-09-01T10:14:50.000Z"),
    completedAt,
    results: [
      {
        serviceName: "api",
        status: "ok",
        latencyMs: 23,
        checkedAt: completedAt,
        payload: { version: "1.4.2", region: "eu" },
      },
      {
        serviceName: "auth",
        status: "degraded",
        latencyMs: 180,
        checkedAt: completedAt,
      },
      {
        serviceName: "search",
        status: "down",
        checkedAt: completedAt,
      },
    ],
  } satisfies AggregateResult;
}

describe("prometheus textfile serialization", () => {
  it("produces gauges for status, latency, and scrape timestamp", () => {
    const aggregate = createAggregateResult();

    const textfile = serializeAggregateResultToPrometheusTextfile(aggregate);

    expect(textfile.endsWith("\n")).toBe(true);

    expect(textfile).toContain("# HELP health_status 1=ok, 0.5=degraded, 0=down\n");
    expect(textfile).toContain("# TYPE health_status gauge\n");
    expect(textfile).toContain('health_status{service="api",region="eu"} 1\n');
    expect(textfile).toContain('health_status{service="auth"} 0.5\n');
    expect(textfile).toContain('health_status{service="search"} 0\n');

    expect(textfile).toContain("# HELP health_latency_ms last observed latency\n");
    expect(textfile).toContain("# TYPE health_latency_ms gauge\n");
    expect(textfile).toContain('health_latency_ms{service="api",region="eu"} 23\n');
    expect(textfile).toContain('health_latency_ms{service="auth"} 180\n');
    expect(textfile).not.toContain('health_latency_ms{service="search"}');

    const expectedTimestamp = aggregate.completedAt.getTime();
    expect(textfile).toContain("# HELP health_scrape_timestamp_ms unix epoch ms\n");
    expect(textfile).toContain("# TYPE health_scrape_timestamp_ms gauge\n");
    expect(textfile).toContain(`health_scrape_timestamp_ms ${expectedTimestamp}\n`);
  });
});
