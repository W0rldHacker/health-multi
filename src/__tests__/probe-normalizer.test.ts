import { describe, expect, it } from "vitest";

import type { MissingStatusPolicy } from "../domain";
import { normalizeStatus, resolveLatency } from "../probe-normalizer";

describe("normalizeStatus", () => {
  it("returns ok when HTTP status is 2xx and payload status is ok", () => {
    expect(
      normalizeStatus({
        httpStatus: 200,
        payload: { status: "ok" },
      }),
    ).toBe("ok");
  });

  it("returns degraded when HTTP status is 2xx and payload status is degraded", () => {
    expect(
      normalizeStatus({
        httpStatus: 204,
        payload: { status: "degraded" },
      }),
    ).toBe("degraded");
  });

  it("returns down when HTTP status is 2xx and payload status is down", () => {
    expect(
      normalizeStatus({
        httpStatus: 200,
        payload: { status: "down" },
      }),
    ).toBe("down");
  });

  it("returns missing status policy when HTTP status is 2xx without explicit status", () => {
    const missingPolicy: MissingStatusPolicy = "degraded";

    expect(
      normalizeStatus({
        httpStatus: 200,
        payload: {},
        missingStatusPolicy: missingPolicy,
      }),
    ).toBe(missingPolicy);
  });

  it("defaults to down when HTTP status is 2xx without explicit status", () => {
    expect(
      normalizeStatus({
        httpStatus: 200,
        payload: {},
      }),
    ).toBe("down");
  });

  it("returns down when HTTP status is not successful regardless of payload", () => {
    expect(
      normalizeStatus({
        httpStatus: 503,
        payload: { status: "ok" },
      }),
    ).toBe("down");
  });

  it("treats unexpected status values as missing and applies policy", () => {
    expect(
      normalizeStatus({
        httpStatus: 200,
        payload: { status: "UNKNOWN" },
        missingStatusPolicy: "degraded",
      }),
    ).toBe("degraded");
  });
});

describe("resolveLatency", () => {
  it("prefers latency reported in payload timings", () => {
    expect(
      resolveLatency({
        payload: { timings: { total_ms: 123 } },
        measuredLatencyMs: 456,
      }),
    ).toEqual({ latencyMs: 123, timings: { totalMs: 123 } });
  });

  it("returns parsed timings and keeps additional fields when available", () => {
    expect(
      resolveLatency({
        payload: {
          timings: {
            total_ms: "42",
            ttfb_ms: 10,
            dns_ms: "5",
            tcp_ms: 7,
            tls_ms: null,
          },
        },
        measuredLatencyMs: 99,
      }),
    ).toEqual({
      latencyMs: 42,
      timings: {
        totalMs: 42,
        ttfbMs: 10,
        dnsMs: 5,
        tcpMs: 7,
      },
    });
  });

  it("falls back to measured latency when payload timings are missing", () => {
    expect(
      resolveLatency({
        payload: {},
        measuredLatencyMs: 250,
      }),
    ).toEqual({ latencyMs: 250 });
  });

  it("returns zero latency when no information is available", () => {
    expect(
      resolveLatency({
        payload: null,
      }),
    ).toEqual({ latencyMs: 0 });
  });
});
