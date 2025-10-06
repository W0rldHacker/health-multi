import { type NormalizedStatus, type ProbeResult } from "./domain";

export interface ServiceObservation extends ProbeResult {
  /** Optional semantic version reported by the service payload. */
  version?: string;
  /** Optional region identifier reported by the service payload. */
  region?: string;
}

export interface ServiceSnapshotMetadata {
  /** Age of the most recent observation in milliseconds. */
  ageMs: number;
  /** Optional semantic version reported by the service payload. */
  version?: string;
  /** Optional region identifier reported by the service payload. */
  region?: string;
  /** Optional error returned by the probe. */
  error?: Error;
}

export interface ServiceSnapshot {
  /** Unique name of the service. */
  serviceName: string;
  /** Latest observation stored for the service. */
  latest?: ServiceObservation;
  /** All stored observations for the service ordered from oldest to newest. */
  history: readonly ServiceObservation[];
  /** Derived metadata for the latest observation. */
  metadata?: ServiceSnapshotMetadata;
}

export interface PercentileSummary {
  /** Median (p50) latency in milliseconds when available. */
  p50?: number;
  /** 95th percentile latency in milliseconds when available. */
  p95?: number;
  /** 99th percentile latency in milliseconds when available. */
  p99?: number;
}

export interface AggregateSummary {
  /** Aggregate status derived from the latest probe results. */
  status: NormalizedStatus;
  /** Metadata enriched snapshots for each service. */
  services: ServiceSnapshot[];
  /** Timestamp when the batch of probes started. */
  startedAt: Date;
  /** Timestamp when the batch of probes completed. */
  completedAt: Date;
  /** Latency percentiles computed from the available observations. */
  latency: PercentileSummary;
}

/** Maximum number of observations stored per service. */
export class ObservationStore {
  private readonly histories = new Map<string, ServiceObservation[]>();

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new TypeError("ObservationStore capacity must be a positive integer");
    }
  }

  /**
   * Stores a new observation in the ring buffer of the respective service.
   */
  add(observation: ServiceObservation): void {
    const history = this.histories.get(observation.serviceName) ?? [];

    if (history.length === this.capacity) {
      history.shift();
    }

    history.push(observation);
    this.histories.set(observation.serviceName, history);
  }

  /**
   * Returns a snapshot of the stored observations for a specific service.
   */
  getHistory(serviceName: string): readonly ServiceObservation[] {
    const history = this.histories.get(serviceName);
    return history ? [...history] : [];
  }

  /** Returns the latest observation for a service if it exists. */
  getLatest(serviceName: string): ServiceObservation | undefined {
    const history = this.histories.get(serviceName);
    if (!history || history.length === 0) {
      return undefined;
    }

    return history[history.length - 1];
  }

  /**
   * Builds snapshots for every tracked service.
   */
  list(): ServiceSnapshot[] {
    return Array.from(this.histories.entries()).map(([serviceName, history]) => ({
      serviceName,
      latest: history.at(-1),
      history: [...history],
    }));
  }
}

function buildSnapshotMetadata(
  latest: ServiceObservation,
  referenceTime: Date,
): ServiceSnapshotMetadata {
  const completedAt = referenceTime.getTime();
  const observedAt = latest.checkedAt.getTime();
  const ageMs = Math.max(0, completedAt - observedAt);

  return {
    ageMs,
    version: latest.version,
    region: latest.region,
    error: latest.error,
  };
}

/**
 * Computes the aggregate status for a collection of probe results.
 */
export function computeAggregateStatus(
  results: Iterable<Pick<ProbeResult, "status">>,
): NormalizedStatus {
  let hasDegraded = false;

  for (const result of results) {
    if (result.status === "down") {
      return "down";
    }

    if (result.status === "degraded") {
      hasDegraded = true;
    }
  }

  return hasDegraded ? "degraded" : "ok";
}

/**
 * Computes latency percentiles for the provided probe results.
 */
export function computeLatencyPercentiles(
  results: Iterable<Pick<ProbeResult, "latencyMs">>,
): PercentileSummary {
  const latencies: number[] = [];

  for (const result of results) {
    if (typeof result.latencyMs === "number" && Number.isFinite(result.latencyMs)) {
      latencies.push(result.latencyMs);
    }
  }

  if (latencies.length === 0) {
    return {};
  }

  latencies.sort((a, b) => a - b);

  return {
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
  };
}

function percentile(values: number[], fraction: number): number {
  const position = fraction * (values.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);

  if (lowerIndex === upperIndex) {
    return values[lowerIndex];
  }

  const lower = values[lowerIndex];
  const upper = values[upperIndex];
  const weight = position - lowerIndex;

  return lower + (upper - lower) * weight;
}

/**
 * Aggregates the latest probe results for each service in the observation store.
 */
export function aggregateObservations(
  store: ObservationStore,
  startedAt: Date,
  completedAt: Date,
): AggregateSummary {
  const services = store.list().map((snapshot) => {
    const metadata = snapshot.latest
      ? buildSnapshotMetadata(snapshot.latest, completedAt)
      : undefined;

    return {
      ...snapshot,
      metadata,
    } satisfies ServiceSnapshot;
  });

  const latestResults = services
    .map((snapshot) => snapshot.latest)
    .filter((result): result is ServiceObservation => result !== undefined);

  return {
    status: computeAggregateStatus(latestResults),
    services,
    startedAt,
    completedAt,
    latency: computeLatencyPercentiles(latestResults),
  } satisfies AggregateSummary;
}
