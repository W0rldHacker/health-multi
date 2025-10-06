import type { MissingStatusPolicy, NormalizedStatus, ProbeTimings } from "./domain";

const HTTP_SUCCESS_MIN = 200;
const HTTP_SUCCESS_MAX = 299;

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHttpSuccess(status: number | undefined): status is number {
  return (
    typeof status === "number" &&
    Number.isInteger(status) &&
    status >= HTTP_SUCCESS_MIN &&
    status <= HTTP_SUCCESS_MAX
  );
}

function normalizeStatusValue(value: unknown): NormalizedStatus | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "ok" || normalized === "degraded" || normalized === "down") {
    return normalized;
  }

  return null;
}

export interface NormalizeStatusOptions {
  httpStatus?: number;
  payload: unknown;
  missingStatusPolicy?: MissingStatusPolicy;
}

export function normalizeStatus(options: NormalizeStatusOptions): NormalizedStatus {
  const { httpStatus, payload, missingStatusPolicy = "down" } = options;

  if (!isHttpSuccess(httpStatus)) {
    return "down";
  }

  if (isObjectLike(payload)) {
    const recordPayload = payload;
    const candidate = normalizeStatusValue(recordPayload.status);

    if (candidate) {
      return candidate;
    }
  }

  return missingStatusPolicy;
}

function coerceTimingValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function extractTimings(payload: unknown): ProbeTimings | undefined {
  if (!isObjectLike(payload)) {
    return undefined;
  }

  const recordPayload = payload;
  const timings = recordPayload.timings;
  if (!isObjectLike(timings)) {
    return undefined;
  }

  const timingsRecord = timings;
  const totalMs = coerceTimingValue(timingsRecord.total_ms);
  if (typeof totalMs !== "number") {
    return undefined;
  }

  const result: ProbeTimings = { totalMs };

  const ttfbMs = coerceTimingValue(timingsRecord.ttfb_ms);
  if (typeof ttfbMs === "number") {
    result.ttfbMs = ttfbMs;
  }

  const dnsMs = coerceTimingValue(timingsRecord.dns_ms);
  if (typeof dnsMs === "number") {
    result.dnsMs = dnsMs;
  }

  const tcpMs = coerceTimingValue(timingsRecord.tcp_ms);
  if (typeof tcpMs === "number") {
    result.tcpMs = tcpMs;
  }

  const tlsMs = coerceTimingValue(timingsRecord.tls_ms);
  if (typeof tlsMs === "number") {
    result.tlsMs = tlsMs;
  }

  return result;
}

export interface ResolveLatencyOptions {
  payload: unknown;
  measuredLatencyMs?: number;
}

export interface ResolveLatencyResult {
  latencyMs: number;
  timings?: ProbeTimings;
}

export function resolveLatency(options: ResolveLatencyOptions): ResolveLatencyResult {
  const { payload, measuredLatencyMs } = options;

  const payloadTimings = extractTimings(payload);
  if (payloadTimings) {
    return { latencyMs: payloadTimings.totalMs, timings: payloadTimings };
  }

  const fallbackLatency =
    typeof measuredLatencyMs === "number" && Number.isFinite(measuredLatencyMs)
      ? measuredLatencyMs
      : 0;

  return { latencyMs: fallbackLatency };
}
