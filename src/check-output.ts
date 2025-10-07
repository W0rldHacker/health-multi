import type { AggregateResult, NormalizedStatus, ProbeResult } from "./domain";
import { readProbeSupplementalField } from "./probe-metadata";

export interface CheckJsonServiceResult {
  name: string;
  status: NormalizedStatus;
  latency_ms?: number;
  version?: string;
  region?: string;
  checked_at?: string;
  url?: string;
}

export interface CheckJsonSnapshot {
  aggregate: NormalizedStatus;
  checked_at: string;
  results: CheckJsonServiceResult[];
}

function toIsoString(date: Date): string {
  const timestamp = date.getTime();

  if (!Number.isFinite(timestamp)) {
    throw new TypeError("Invalid Date value provided for serialization");
  }

  return date.toISOString();
}

function toOptionalIsoString(date: Date | undefined): string | undefined {
  if (!(date instanceof Date)) {
    return undefined;
  }

  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) {
    return undefined;
  }

  return date.toISOString();
}

function buildServiceResultPayload(result: ProbeResult): CheckJsonServiceResult {
  const payload: CheckJsonServiceResult = {
    name: result.serviceName,
    status: result.status,
  };

  if (typeof result.latencyMs === "number" && Number.isFinite(result.latencyMs)) {
    payload.latency_ms = result.latencyMs;
  }

  const checkedAt = toOptionalIsoString(result.checkedAt);
  if (checkedAt) {
    payload.checked_at = checkedAt;
  }

  const version = readProbeSupplementalField(result, "version");
  if (version) {
    payload.version = version;
  }

  const region = readProbeSupplementalField(result, "region");
  if (region) {
    payload.region = region;
  }

  const url = readProbeSupplementalField(result, "url");
  if (url) {
    payload.url = url;
  }

  return payload;
}

export function buildCheckJsonSnapshot(aggregate: AggregateResult): CheckJsonSnapshot {
  return {
    aggregate: aggregate.status,
    checked_at: toIsoString(aggregate.completedAt),
    results: aggregate.results.map(buildServiceResultPayload),
  } satisfies CheckJsonSnapshot;
}

export function serializeAggregateResultToJson(aggregate: AggregateResult): string {
  return `${JSON.stringify(buildCheckJsonSnapshot(aggregate), null, 2)}\n`;
}

export function serializeAggregateResultToNdjson(aggregate: AggregateResult): string {
  if (aggregate.results.length === 0) {
    return "";
  }

  const lines = aggregate.results.map((result) =>
    JSON.stringify(buildServiceResultPayload(result)),
  );
  return `${lines.join("\n")}\n`;
}
