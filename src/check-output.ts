import type { AggregateResult, NormalizedStatus, ProbeResult } from "./domain";

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

type SupplementalField = "version" | "region" | "url";

const PAYLOAD_SUPPORTED_FIELDS: Record<SupplementalField, boolean> = {
  version: true,
  region: true,
  url: false,
};

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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

type SupplementalProbeResult = ProbeResult & Partial<Record<SupplementalField, unknown>>;

function readSupplementalField(result: ProbeResult, field: SupplementalField): string | undefined {
  const record = result as SupplementalProbeResult;
  const direct = normalizeOptionalString(record[field]);
  if (direct) {
    return direct;
  }

  if (PAYLOAD_SUPPORTED_FIELDS[field] && isObjectLike(result.payload)) {
    return normalizeOptionalString(result.payload[field]);
  }

  return undefined;
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

  const version = readSupplementalField(result, "version");
  if (version) {
    payload.version = version;
  }

  const region = readSupplementalField(result, "region");
  if (region) {
    payload.region = region;
  }

  const url = readSupplementalField(result, "url");
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
