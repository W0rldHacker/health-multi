import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { MissingStatusPolicy, NormalizedStatus } from "../domain";
import { httpRequest } from "../http";
import { normalizeStatus, resolveLatency } from "../probe-normalizer";
import { startMockHealthServer, type MockHealthServer } from "../testing/mock-health-server";

interface ProbeExecution {
  status: NormalizedStatus;
  httpStatus?: number;
  latencyMs?: number;
  payload?: unknown;
  error?: Error;
}

async function executeProbe(
  url: string,
  missingStatusPolicy?: MissingStatusPolicy,
): Promise<ProbeExecution> {
  const startedAt = Date.now();

  try {
    const response = await httpRequest({
      url,
      method: "GET",
      timeoutMs: 1_000,
      env: {},
    });

    const bodyText = await response.body.text();
    const payload: unknown = JSON.parse(bodyText);

    const status = normalizeStatus({
      httpStatus: response.statusCode,
      payload,
      missingStatusPolicy,
    });

    const { latencyMs } = resolveLatency({
      payload,
      measuredLatencyMs: Date.now() - startedAt,
    });

    return {
      status,
      httpStatus: response.statusCode,
      payload,
      latencyMs,
    };
  } catch (error) {
    return {
      status: "down",
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

describe("probe integration with mock services", () => {
  let server: MockHealthServer;

  beforeAll(async () => {
    server = await startMockHealthServer({ slowDelayMs: 110 });
  });

  afterAll(async () => {
    await server.close();
  });

  it("normalizes healthy responses", async () => {
    const result = await executeProbe(server.url("/health/ok"));

    expect(result.status).toBe("ok");
    expect(result.httpStatus).toBe(200);
    expect(result.latencyMs).toBe(12);
    expect(result.payload).toMatchObject({
      status: "ok",
      timings: { total_ms: 12 },
      version: "1.0.0",
    });
  });

  it("resolves timings reported by slow services", async () => {
    const result = await executeProbe(server.url("/health/slow"));

    expect(result.status).toBe("ok");
    expect(result.latencyMs).toBe(server.slowDelayMs);
  });

  it("applies missing status policy when payload is incomplete", async () => {
    const result = await executeProbe(server.url("/health/missing-status"), "degraded");

    expect(result.status).toBe("degraded");
    expect(result.httpStatus).toBe(200);
    expect(result.payload).toMatchObject({ version: "2.0.0" });
  });

  it("returns down status when connection drops", async () => {
    const result = await executeProbe(server.url("/health/drop"));

    expect(result.status).toBe("down");
    expect(result.error).toBeInstanceOf(Error);
  });

  it("returns down status for invalid JSON payloads", async () => {
    const result = await executeProbe(server.url("/health/invalid-json"));

    expect(result.status).toBe("down");
    expect(result.error).toBeInstanceOf(Error);
  });

  it("returns down status for non-JSON content", async () => {
    const result = await executeProbe(server.url("/health/html"));

    expect(result.status).toBe("down");
    expect(result.error).toBeInstanceOf(Error);
  });
});
