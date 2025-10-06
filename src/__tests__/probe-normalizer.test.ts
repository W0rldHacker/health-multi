import { describe, expect, it } from "vitest";

import type { MissingStatusPolicy, NormalizedStatus } from "../domain";
import { normalizeStatus, resolveLatency } from "../probe-normalizer";

describe("normalizeStatus", () => {
  const successHttpStatuses = [200, 204, 250, 299];
  const failureHttpStatuses = [undefined, 100, 199, 300, 404, 503];
  const normalizedValues: NormalizedStatus[] = ["ok", "degraded", "down"];

  describe("successful HTTP codes", () => {
    it.each(successHttpStatuses)("returns payload status for code %s", (httpStatus) => {
      for (const expected of normalizedValues) {
        expect(
          normalizeStatus({
            httpStatus,
            payload: { status: expected },
          }),
        ).toBe(expected);
      }
    });

    it.each(successHttpStatuses)(
      "applies provided missing policy when payload.status is absent for code %s",
      (httpStatus) => {
        const policies: MissingStatusPolicy[] = ["down", "degraded"];

        for (const policy of policies) {
          expect(
            normalizeStatus({
              httpStatus,
              payload: {},
              missingStatusPolicy: policy,
            }),
          ).toBe(policy);

          expect(
            normalizeStatus({
              httpStatus,
              payload: { status: undefined },
              missingStatusPolicy: policy,
            }),
          ).toBe(policy);

          expect(
            normalizeStatus({
              httpStatus,
              payload: { status: 123 },
              missingStatusPolicy: policy,
            }),
          ).toBe(policy);

          expect(
            normalizeStatus({
              httpStatus,
              payload: "not an object",
              missingStatusPolicy: policy,
            }),
          ).toBe(policy);
        }
      },
    );

    it.each(successHttpStatuses)("defaults to down policy for code %s", (httpStatus) => {
      expect(
        normalizeStatus({
          httpStatus,
          payload: {},
        }),
      ).toBe("down");
    });
  });

  describe("non-successful HTTP codes", () => {
    it.each(failureHttpStatuses)("returns down regardless of payload for code %s", (httpStatus) => {
      for (const status of normalizedValues) {
        expect(
          normalizeStatus({
            httpStatus,
            payload: { status },
          }),
        ).toBe("down");
      }

      expect(
        normalizeStatus({
          httpStatus,
          payload: {},
          missingStatusPolicy: "degraded",
        }),
      ).toBe("down");

      expect(
        normalizeStatus({
          httpStatus,
          payload: null,
        }),
      ).toBe("down");
    });
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
