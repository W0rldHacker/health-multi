import type { ProbeResult } from "./domain";

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

type SupplementalProbeResult = ProbeResult & Partial<Record<SupplementalField, unknown>>;

export function readProbeSupplementalField(
  result: ProbeResult,
  field: SupplementalField,
): string | undefined {
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
