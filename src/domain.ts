export type NormalizedStatus = "ok" | "degraded" | "down";

export type MissingStatusPolicy = Exclude<NormalizedStatus, "ok">;

export type CheckOutputFormat = "json" | "ndjson";

export interface Service {
  /**
   * Human readable unique name of the service.
   */
  name: string;
  /**
   * Endpoint that should be probed.
   */
  url: string;
  /**
   * Expected normalized status returned by the service.
   */
  expectStatus?: NormalizedStatus;
  /**
   * Optional static tags to allow grouping/filtering in TUI or exports.
   */
  tags?: string[];
  /**
   * Per-service HTTP headers that should be attached to the probe request.
   */
  headers?: Record<string, string>;
  /**
   * Override proxy for this particular service.
   */
  proxy?: string;
  /**
   * When defined, overrides the global timeout for the service probe in milliseconds.
   */
  timeoutMs?: number;
}

export interface ProbeTimings {
  /** Time from request start until the first byte is received. */
  ttfbMs?: number;
  /** Total time spent on the request. */
  totalMs: number;
  /** Optional DNS lookup duration. */
  dnsMs?: number;
  /** Optional TCP connection duration. */
  tcpMs?: number;
  /** Optional TLS handshake duration. */
  tlsMs?: number;
}

export interface ProbeResult {
  /** Name of the service the result belongs to. */
  serviceName: string;
  /** Normalized status derived from the response body and HTTP status. */
  status: NormalizedStatus;
  /** HTTP status code returned by the endpoint if available. */
  httpStatus?: number;
  /** Measured latency in milliseconds (defaults to timings.totalMs). */
  latencyMs?: number;
  /** Structured timings for debug visualisation. */
  timings?: ProbeTimings;
  /** Timestamp when the probe was executed. */
  checkedAt: Date;
  /** Optional JSON body returned by the service. */
  payload?: unknown;
  /** Optional error when the probe failed before a response was produced. */
  error?: Error;
}

export interface AggregateResult {
  /** Final aggregate status for the batch of probe results. */
  status: NormalizedStatus;
  /** All individual results that were aggregated. */
  results: ProbeResult[];
  /** Timestamp when the batch started. */
  startedAt: Date;
  /** Timestamp when the batch finished. */
  completedAt: Date;
}

export interface CliParameters {
  /** Path to the services configuration file. */
  configPath?: string;
  /** Interval between probe cycles in milliseconds. */
  intervalMs?: number;
  /** Timeout for a single HTTP request in milliseconds. */
  timeoutMs?: number;
  /** Number of retry attempts performed when a probe fails. */
  retries?: number;
  /** Maximum number of probes executed in parallel. */
  concurrency?: number;
  /** Default headers added to every request unless overridden by the service. */
  headers?: Record<string, string>;
  /** HTTP proxy URL used for outbound requests. */
  proxy?: string;
  /** Disable TLS verification (should only be used for tests). */
  insecure?: boolean;
  /** Enable verbose HTTP diagnostics logging. */
  debug?: boolean;
  /**
   * Determines which status should be assigned when the response payload
   * does not contain an explicit status field.
   */
  missingStatusPolicy?: MissingStatusPolicy;
  /** Output format for results produced by the check command. */
  outputFormat?: CheckOutputFormat;
}
