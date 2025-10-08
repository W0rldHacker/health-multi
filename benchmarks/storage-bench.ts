import { createServer as createSrv, type Ctx } from "@worldhacker/starpath";
import { mkdir } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import pLimit from "p-limit";

import { type MissingStatusPolicy, type NormalizedStatus } from "../src/domain";
import { normalizeStatus, resolveLatency } from "../src/probe-normalizer";
import type {
  AggregateSummary,
  ObservationStore as ObservationStoreInstance,
  ServiceObservation,
} from "../src/storage";

type ObservationStoreConstructor = new (capacity: number) => ObservationStoreInstance;
type AggregateObservationsFn = (
  store: ObservationStoreInstance,
  startedAt: Date,
  completedAt: Date,
) => AggregateSummary;

interface StorageBindings {
  readonly ObservationStore: ObservationStoreConstructor;
  readonly aggregateObservations: AggregateObservationsFn;
}

let storageModulePromise: Promise<StorageBindings> | undefined;

async function loadStorageModule(): Promise<StorageBindings> {
  storageModulePromise ??= import("../src/storage").then((module) => ({
    ObservationStore: module.ObservationStore,
    aggregateObservations: module.aggregateObservations,
  }));
  return storageModulePromise;
}

const DEFAULT_SERVICE_COUNT = 200;
const DEFAULT_BATCHES = 25;
const DEFAULT_CONCURRENCY = 50;
const DEFAULT_CAPACITY = 64;
const DEFAULT_MISSING_STATUS_POLICY: MissingStatusPolicy = "degraded";
const PROFILE_DIR = new URL("./profiles/", new URL(".", import.meta.url));

interface MockServicePrototype {
  readonly label: string;
  readonly baseLatencyMs: number;
  readonly jitterMs: number;
  readonly status: NormalizedStatus;
  readonly failureRate: number;
  readonly region: string;
  readonly includeVersion: boolean;
  readonly failureMode?: "http-error" | "invalid-json" | "drop-connection";
  readonly omitStatus?: boolean;
}

interface MockServiceDefinition extends MockServicePrototype {
  readonly id: number;
  readonly name: string;
  readonly version: string;
}

interface BenchCluster {
  readonly baseUrl: string;
  readonly services: MockServiceDefinition[];
  close(): Promise<void>;
}

function jsonResponse(body: unknown): {
  status: number;
  headers: Record<string, string>;
  body: string;
} {
  const payload = JSON.stringify(body);
  return {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-length": String(Buffer.byteLength(payload)),
    },
    body: payload,
  };
}

async function startBenchCluster(serviceCount: number): Promise<BenchCluster> {
  const prototypes = buildServicePrototypes();
  const services: MockServiceDefinition[] = Array.from({ length: serviceCount }, (_, index) => {
    const prototype = prototypes[index % prototypes.length];
    const id = index + 1;
    return {
      ...prototype,
      id,
      name: `${prototype.label}-${String(id).padStart(3, "0")}`,
      version: `v${1 + (index % 10)}.${(index % 5) * 2}.0`,
    } satisfies MockServiceDefinition;
  });

  const server = createSrv();
  const serviceMap = new Map<string, MockServiceDefinition>();
  for (const service of services) {
    serviceMap.set(String(service.id), service);
  }

  server.route("GET", "/services/:id/health", async (ctx) => {
    const service = serviceMap.get(ctx.params.id);
    if (!service) {
      await ctx.respond({
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
        body: "unknown service",
      });
      return;
    }

    const latency = simulateLatency(service);
    await delay(latency);

    if (Math.random() < service.failureRate) {
      await respondWithFailure(ctx, service);
      return;
    }

    const responseStatus = service.status === "down" ? 503 : 200;
    const payload: Record<string, unknown> = {
      status: service.status,
      timings: { total_ms: latency },
      region: service.region,
    };

    if (service.includeVersion) {
      payload.version = service.version;
    }

    if (service.omitStatus) {
      delete payload.status;
    }

    await ctx.respond({
      ...jsonResponse(payload),
      status: responseStatus,
    });
  });

  let assignedPort = 0;
  await server.listen({
    host: "127.0.0.1",
    onListen({ port }) {
      assignedPort = port;
    },
  });

  if (assignedPort === 0) {
    throw new Error("Failed to start benchmark cluster");
  }

  const baseUrl = `http://127.0.0.1:${assignedPort}`;

  return {
    baseUrl,
    services,
    async close() {
      await server.close();
    },
  } satisfies BenchCluster;
}

function buildServicePrototypes(): MockServicePrototype[] {
  return [
    {
      label: "fast-prod",
      baseLatencyMs: 15,
      jitterMs: 5,
      status: "ok",
      failureRate: 0.01,
      region: "eu-central-1",
      includeVersion: true,
    },
    {
      label: "steady-prod",
      baseLatencyMs: 45,
      jitterMs: 15,
      status: "ok",
      failureRate: 0.05,
      region: "us-east-1",
      includeVersion: true,
    },
    {
      label: "slow-prod",
      baseLatencyMs: 180,
      jitterMs: 60,
      status: "ok",
      failureRate: 0.02,
      region: "ap-southeast-1",
      includeVersion: false,
    },
    {
      label: "degraded-stage",
      baseLatencyMs: 240,
      jitterMs: 90,
      status: "degraded",
      failureRate: 0.1,
      region: "eu-west-1",
      includeVersion: false,
    },
    {
      label: "flaky-stage",
      baseLatencyMs: 120,
      jitterMs: 55,
      status: "ok",
      failureRate: 0.2,
      region: "us-west-2",
      includeVersion: true,
      failureMode: "invalid-json",
    },
    {
      label: "down-prod",
      baseLatencyMs: 90,
      jitterMs: 35,
      status: "down",
      failureRate: 0.5,
      region: "eu-north-1",
      includeVersion: true,
      failureMode: "drop-connection",
    },
    {
      label: "unstable-prod",
      baseLatencyMs: 70,
      jitterMs: 25,
      status: "ok",
      failureRate: 0.15,
      region: "us-central1",
      includeVersion: false,
      failureMode: "http-error",
      omitStatus: true,
    },
  ];
}

function simulateLatency(service: MockServicePrototype): number {
  const jitter = service.jitterMs;
  if (jitter <= 0) {
    return Math.max(0, Math.round(service.baseLatencyMs));
  }

  const delta = (Math.random() * 2 - 1) * jitter;
  const latency = Math.round(service.baseLatencyMs + delta);
  return Math.max(0, latency);
}

async function respondWithFailure(ctx: Ctx, service: MockServicePrototype): Promise<void> {
  switch (service.failureMode) {
    case "invalid-json": {
      await ctx.respond({
        status: 200,
        headers: { "content-type": "application/json" },
        body: '{"status":"ok"',
      });
      return;
    }
    case "drop-connection": {
      ctx.res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
      });
      ctx.res.write('{"status":"ok"');
      ctx.res.destroy();
      return;
    }
    case "http-error":
    default: {
      await ctx.respond({
        status: 503,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          status: "down",
          error: "simulated outage",
        }),
      });
    }
  }
}

interface BenchOptions {
  serviceCount: number;
  batches: number;
  concurrency: number;
  capacity: number;
  missingStatusPolicy: MissingStatusPolicy;
}

async function runBench(options: BenchOptions): Promise<void> {
  await mkdir(PROFILE_DIR, { recursive: true });

  const cluster = await startBenchCluster(options.serviceCount);
  console.log(
    `▶️  Benchmark cluster started on ${cluster.baseUrl} with ${cluster.services.length} services`,
  );

  const limit = pLimit(options.concurrency);
  const storageModule = await loadStorageModule();
  const store = new storageModule.ObservationStore(options.capacity);

  try {
    for (let batchIndex = 0; batchIndex < options.batches; batchIndex += 1) {
      const startedAt = new Date();
      const results = await Promise.all(
        cluster.services.map((service) =>
          limit(() => probeService(cluster.baseUrl, service, options.missingStatusPolicy)),
        ),
      );
      const completedAt = new Date();

      for (const observation of results) {
        store.add(observation);
      }

      const summary = storageModule.aggregateObservations(store, startedAt, completedAt);
      console.log(
        `Batch ${batchIndex + 1}/${options.batches}: status=${summary.status}, services=${summary.services.length}, p95=${summary.latency.p95 ?? "n/a"}ms`,
      );
    }
  } finally {
    await cluster.close();
  }

  console.log("✅ Benchmark complete");
}

async function probeService(
  baseUrl: string,
  service: MockServiceDefinition,
  missingStatusPolicy: MissingStatusPolicy,
): Promise<ServiceObservation> {
  const started = performance.now();
  const checkedAt = new Date();
  const url = `${baseUrl}/services/${service.id}/health`;

  try {
    const response = await fetch(url);
    const measuredLatency = performance.now() - started;
    let payload: unknown;
    let parseError: Error | undefined;

    try {
      const rawBody = await response.text();
      if (rawBody.length > 0) {
        payload = JSON.parse(rawBody);
      }
    } catch (error) {
      parseError = error instanceof Error ? error : new Error(String(error));
    }

    const { latencyMs, timings } = resolveLatency({
      payload,
      measuredLatencyMs: measuredLatency,
    });

    const status = parseError
      ? "down"
      : normalizeStatus({
          httpStatus: response.status,
          payload,
          missingStatusPolicy,
        });

    const observation: ServiceObservation = {
      serviceName: service.name,
      status,
      httpStatus: response.status,
      latencyMs,
      timings,
      checkedAt,
      payload,
      error: parseError,
    };

    if (payload && typeof payload === "object") {
      const record = payload as Record<string, unknown>;
      if (typeof record.version === "string") {
        observation.version = record.version;
      }
      if (typeof record.region === "string") {
        observation.region = record.region;
      }
    }

    return observation;
  } catch (error) {
    const latencyMs = Math.max(0, Math.round(performance.now() - started));
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      serviceName: service.name,
      status: "down",
      latencyMs,
      checkedAt,
      error: err,
    } satisfies ServiceObservation;
  }
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readOptionsFromEnv(): BenchOptions {
  return {
    serviceCount: parseInteger(process.env.BENCH_SERVICE_COUNT, DEFAULT_SERVICE_COUNT),
    batches: parseInteger(process.env.BENCH_BATCHES, DEFAULT_BATCHES),
    concurrency: parseInteger(process.env.BENCH_CONCURRENCY, DEFAULT_CONCURRENCY),
    capacity: parseInteger(process.env.BENCH_CAPACITY, DEFAULT_CAPACITY),
    missingStatusPolicy:
      parseMissingStatusPolicy(process.env.BENCH_MISSING_STATUS_POLICY) ??
      DEFAULT_MISSING_STATUS_POLICY,
  } satisfies BenchOptions;
}

function parseMissingStatusPolicy(value: string | undefined): MissingStatusPolicy | undefined {
  if (value === "degraded" || value === "down") {
    return value;
  }
  return undefined;
}

async function main(): Promise<void> {
  const options = readOptionsFromEnv();
  console.log("Running storage benchmark with options:", options);
  await runBench(options);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error("❌ Benchmark failed", error);
    process.exitCode = 1;
  });
}
