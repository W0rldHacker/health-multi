import { describe, expect, it } from "vitest";

import { serializeAggregateResultToJson, serializeAggregateResultToNdjson } from "../check-output";
import { type AggregateResult } from "../domain";

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
    ],
  } satisfies AggregateResult;
}

describe("check output serialization", () => {
  it("produces JSON output with ISO timestamps and optional metadata", () => {
    const aggregate = createAggregateResult();

    const json = serializeAggregateResultToJson(aggregate);
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(parsed).toMatchObject({
      aggregate: "degraded",
      checked_at: "2025-09-01T10:15:00.000Z",
    });

    const results = parsed.results as unknown[];
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(2);

    const [first, second] = results as Array<Record<string, unknown>>;

    expect(first).toMatchObject({
      name: "api",
      status: "ok",
      latency_ms: 23,
      version: "1.4.2",
      region: "eu",
      checked_at: "2025-09-01T10:15:00.000Z",
    });

    expect(second).toMatchObject({
      name: "auth",
      status: "degraded",
      latency_ms: 180,
    });
  });

  it("produces NDJSON output with one entry per service", () => {
    const aggregate = createAggregateResult();

    const ndjson = serializeAggregateResultToNdjson(aggregate);

    const lines = ndjson
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(lines).toHaveLength(2);
    expect(ndjson.endsWith("\n")).toBe(true);

    expect(lines[0]).toMatchObject({
      name: "api",
      status: "ok",
      latency_ms: 23,
      version: "1.4.2",
      region: "eu",
      checked_at: "2025-09-01T10:15:00.000Z",
    });

    expect(lines[1]).toMatchObject({
      name: "auth",
      status: "degraded",
      latency_ms: 180,
    });
  });
});
