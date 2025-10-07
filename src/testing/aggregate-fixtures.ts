import { type AggregateResult } from "../domain";

export function createSampleAggregateResult(): AggregateResult {
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
