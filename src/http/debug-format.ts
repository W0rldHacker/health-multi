import { type HttpDebugLogEntry } from "./debug";

const BAR_WIDTH = 14;
const EMPTY_SEGMENT = "·";
const FILL_SEGMENT = "█";

interface TimelineSegmentDefinition {
  label: string;
  value: number | undefined;
}

function formatDuration(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "--";
  }

  if (value >= 1_000) {
    const seconds = value / 1_000;
    if (seconds >= 10) {
      return `${Math.round(seconds)}s`;
    }

    return `${seconds.toFixed(1)}s`;
  }

  if (value >= 1) {
    return `${Math.round(value)}ms`;
  }

  return `${value.toFixed(2)}ms`;
}

function buildBar(value: number | undefined, total: number): string {
  if (!(typeof value === "number" && Number.isFinite(value)) || value <= 0 || total <= 0) {
    return EMPTY_SEGMENT.repeat(BAR_WIDTH);
  }

  const normalized = value / total;
  const clamped = Math.max(0, Math.min(1, normalized));
  const filledWidth = Math.max(1, Math.round(clamped * BAR_WIDTH));
  const limitedWidth = Math.min(filledWidth, BAR_WIDTH);
  return `${FILL_SEGMENT.repeat(limitedWidth)}${EMPTY_SEGMENT.repeat(BAR_WIDTH - limitedWidth)}`;
}

function formatTimelineSegments(entry: HttpDebugLogEntry): TimelineSegmentDefinition[] {
  const { timings } = entry;
  return [
    { label: "dns", value: timings.dnsMs },
    { label: "tcp", value: timings.tcpMs },
    { label: "tls", value: timings.tlsMs },
    { label: "ttfb", value: timings.ttfbMs },
    { label: "total", value: timings.totalMs },
  ];
}

export function formatHttpDebugTimeline(entry: HttpDebugLogEntry): string {
  const total = entry.timings.totalMs;
  const segments = formatTimelineSegments(entry);

  return segments
    .map(({ label, value }, index) => {
      const bar =
        index === segments.length - 1 ? FILL_SEGMENT.repeat(BAR_WIDTH) : buildBar(value, total);
      const duration = formatDuration(value).padStart(6, " ");
      return `${label.padEnd(4, " ")}[${bar}]${duration}`;
    })
    .join("  ");
}

function formatConnectionState(entry: HttpDebugLogEntry): string | undefined {
  if (!entry.connection) {
    return undefined;
  }

  const reused = entry.connection.reused ? "reused" : "new";
  const address = entry.connection.remoteAddress;
  const port = entry.connection.remotePort;

  if (address && typeof port === "number") {
    return `conn=${reused}@${address}:${port}`;
  }

  return `conn=${reused}`;
}

export function formatHttpDebugLogEntry(entry: HttpDebugLogEntry): string {
  const summaryParts: string[] = [`[${entry.id}]`, entry.method.toUpperCase(), entry.url];

  if (entry.statusCode !== undefined) {
    summaryParts.push(`status=${entry.statusCode}`);
  }

  if (entry.error) {
    summaryParts.push(`error=${entry.error.name}`);
  }

  summaryParts.push(`attempt=${entry.attempt}`);

  if (entry.retries > 0) {
    summaryParts.push(`retries=${entry.retries}`);
  }

  if (typeof entry.backoffMs === "number") {
    summaryParts.push(`backoff=${formatDuration(entry.backoffMs)}`);
  }

  const connectionState = formatConnectionState(entry);
  if (connectionState) {
    summaryParts.push(connectionState);
  }

  summaryParts.push(`total=${formatDuration(entry.timings.totalMs)}`);

  const summaryLine = summaryParts.join(" ");
  const timelineLine = formatHttpDebugTimeline(entry);

  return `${summaryLine}\n  ${timelineLine}`;
}
