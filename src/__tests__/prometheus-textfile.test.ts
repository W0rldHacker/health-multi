import { describe, expect, it } from "vitest";

import { serializeAggregateResultToPrometheusTextfile } from "../prometheus-textfile";
import { createSampleAggregateResult } from "../testing/aggregate-fixtures";

describe("prometheus textfile serialization", () => {
  it("produces gauges for status, latency, and scrape timestamp", () => {
    const aggregate = createSampleAggregateResult();

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

  it("escapes reserved characters in label values", () => {
    const aggregate = createSampleAggregateResult();

    aggregate.results[0] = {
      ...aggregate.results[0],
      serviceName: 'svc"1',
      payload: { region: "eu\nwest\\1" },
    };

    const textfile = serializeAggregateResultToPrometheusTextfile(aggregate);

    expect(textfile).toContain('health_status{service="svc\\"1",region="eu\\nwest\\\\1"} 1');
    expect(textfile).toContain('health_latency_ms{service="svc\\"1",region="eu\\nwest\\\\1"} 23');
  });
});
