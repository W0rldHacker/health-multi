import type { AggregateResult, ProbeResult } from "./domain";
import { readProbeSupplementalField } from "./probe-metadata";

const STATUS_VALUES: Record<ProbeResult["status"], number> = {
  ok: 1,
  degraded: 0.5,
  down: 0,
};

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function formatLabels(labels: Record<string, string | undefined>): string {
  const entries = Object.entries(labels).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return "";
  }

  const rendered = entries
    .map(([key, value]) => `${key}="${escapeLabelValue(String(value))}"`)
    .join(",");

  return `{${rendered}}`;
}

function assertFiniteTimestamp(timestamp: number): number {
  if (!Number.isFinite(timestamp)) {
    throw new TypeError("Invalid Date value provided for serialization");
  }

  return timestamp;
}

function serializeStatusMetric(result: ProbeResult): string {
  const labels = {
    service: result.serviceName,
    region: readProbeSupplementalField(result, "region"),
  } satisfies Record<string, string | undefined>;

  const value = STATUS_VALUES[result.status];
  return `health_status${formatLabels(labels)} ${value}`;
}

function serializeLatencyMetric(result: ProbeResult): string | undefined {
  if (typeof result.latencyMs !== "number" || !Number.isFinite(result.latencyMs)) {
    return undefined;
  }

  const labels = {
    service: result.serviceName,
    region: readProbeSupplementalField(result, "region"),
  } satisfies Record<string, string | undefined>;

  return `health_latency_ms${formatLabels(labels)} ${result.latencyMs}`;
}

export function serializeAggregateResultToPrometheusTextfile(aggregate: AggregateResult): string {
  const lines: string[] = [];

  lines.push("# HELP health_status 1=ok, 0.5=degraded, 0=down");
  lines.push("# TYPE health_status gauge");
  lines.push(...aggregate.results.map(serializeStatusMetric));

  lines.push("", "# HELP health_latency_ms last observed latency");
  lines.push("# TYPE health_latency_ms gauge");

  for (const result of aggregate.results) {
    const metric = serializeLatencyMetric(result);
    if (metric) {
      lines.push(metric);
    }
  }

  const timestampMs = assertFiniteTimestamp(aggregate.completedAt.getTime());

  lines.push(
    "",
    "# HELP health_scrape_timestamp_ms unix epoch ms",
    "# TYPE health_scrape_timestamp_ms gauge",
    `health_scrape_timestamp_ms ${timestampMs}`,
  );

  return `${lines.join("\n")}\n`;
}
