import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeHeapSnapshot } from "node:v8";

import { readOptionsFromEnv, runBench, type BenchOptions } from "./storage-bench.js";

const SOAK_PROFILE_DIR = new URL("../../profiles/soak/", import.meta.url);
const SOAK_METRICS_FILE = new URL("storage-soak-metrics.json", SOAK_PROFILE_DIR);

const MS_PER_MINUTE = 60_000;
const BYTES_PER_MEGABYTE = 1024 * 1024;

const DEFAULT_DURATION_MINUTES = 60;
const DEFAULT_MAX_RSS_MB = 256;
const DEFAULT_MAX_CPU_PERCENT = 65;
const DEFAULT_ITERATION_DELAY_MS = 250;

interface SoakOptions {
  readonly durationMinutes: number;
  readonly maxRssMb: number;
  readonly maxCpuPercent: number;
  readonly iterationDelayMs: number;
}

interface SoakMetrics {
  readonly iterations: number;
  readonly durationSeconds: number;
  readonly rssPeakMb: number;
  readonly cpuPercent: number;
  readonly heapSnapshotPath: string;
  readonly metricsPath: string;
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseNonNegative(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function readSoakOptionsFromEnv(): SoakOptions {
  return {
    durationMinutes: parsePositiveNumber(
      process.env.SOAK_DURATION_MINUTES,
      DEFAULT_DURATION_MINUTES,
    ),
    maxRssMb: parsePositiveNumber(process.env.SOAK_MAX_RSS_MB, DEFAULT_MAX_RSS_MB),
    maxCpuPercent: parsePositiveNumber(process.env.SOAK_MAX_CPU_PERCENT, DEFAULT_MAX_CPU_PERCENT),
    iterationDelayMs: parseNonNegative(
      process.env.SOAK_ITERATION_DELAY_MS,
      DEFAULT_ITERATION_DELAY_MS,
    ),
  } satisfies SoakOptions;
}

async function runSoak(benchOptions: BenchOptions, soakOptions: SoakOptions): Promise<SoakMetrics> {
  await mkdir(SOAK_PROFILE_DIR, { recursive: true });

  const cpuBaseline = process.cpuUsage();
  const startTime = performance.now();
  const deadline = startTime + soakOptions.durationMinutes * MS_PER_MINUTE;
  let iterations = 0;
  let rssPeakBytes = 0;

  console.log(
    `🌙 Starting storage soak: duration=${soakOptions.durationMinutes}m, maxRSS=${soakOptions.maxRssMb}MB, maxCPU=${soakOptions.maxCpuPercent}%`,
  );

  do {
    iterations += 1;
    const iterationStart = performance.now();
    console.log(`▶️  Soak iteration ${iterations} started`);
    await runBench(benchOptions);

    const rssBytes = process.memoryUsage().rss;
    rssPeakBytes = Math.max(rssPeakBytes, rssBytes);
    const rssMb = rssBytes / BYTES_PER_MEGABYTE;
    console.log(
      `✅ Soak iteration ${iterations} finished in ${((performance.now() - iterationStart) / 1000).toFixed(2)}s (RSS=${rssMb.toFixed(1)}MB, peak=${(rssPeakBytes / BYTES_PER_MEGABYTE).toFixed(1)}MB)`,
    );

    if (rssMb > soakOptions.maxRssMb) {
      throw new Error(
        `Resident set size ${rssMb.toFixed(1)}MB exceeded configured ceiling of ${soakOptions.maxRssMb}MB`,
      );
    }

    if (soakOptions.iterationDelayMs > 0) {
      await delay(soakOptions.iterationDelayMs);
    }
  } while (performance.now() < deadline);

  const elapsedMs = performance.now() - startTime;
  const elapsedSeconds = elapsedMs / 1000;
  const cpuUsage = process.cpuUsage(cpuBaseline);
  const cpuSeconds = (cpuUsage.user + cpuUsage.system) / 1_000_000;
  const cpuPercent = elapsedSeconds > 0 ? (cpuSeconds / elapsedSeconds) * 100 : 0;

  const peakRssMb = rssPeakBytes / BYTES_PER_MEGABYTE;
  if (peakRssMb > soakOptions.maxRssMb) {
    throw new Error(
      `Resident set size ${peakRssMb.toFixed(1)}MB exceeded configured ceiling of ${soakOptions.maxRssMb}MB`,
    );
  }

  if (cpuPercent > soakOptions.maxCpuPercent) {
    throw new Error(
      `Average CPU utilisation ${cpuPercent.toFixed(1)}% exceeded configured ceiling of ${soakOptions.maxCpuPercent}%`,
    );
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshotTarget = new URL(`storage-soak-${timestamp}.heapsnapshot`, SOAK_PROFILE_DIR);
  const snapshotPath = writeHeapSnapshot(fileURLToPath(snapshotTarget));
  const metricsPath = fileURLToPath(SOAK_METRICS_FILE);

  const metrics: SoakMetrics = {
    iterations,
    durationSeconds: elapsedSeconds,
    rssPeakMb: peakRssMb,
    cpuPercent,
    heapSnapshotPath: snapshotPath,
    metricsPath,
  } satisfies SoakMetrics;

  await writeFile(metricsPath, JSON.stringify(metrics, null, 2), "utf8");

  console.log(
    `🌙 Storage soak complete after ${iterations} iterations and ${elapsedSeconds.toFixed(1)}s (CPU=${cpuPercent.toFixed(1)}%, peak RSS=${peakRssMb.toFixed(1)}MB)`,
  );
  console.log(`🧠 Heap snapshot saved to ${snapshotPath}`);
  console.log(`📝 Metrics saved to ${metricsPath}`);

  return metrics;
}

async function main(): Promise<void> {
  const benchOptions = readOptionsFromEnv();
  const soakOptions = readSoakOptionsFromEnv();
  console.log("Using benchmark options:", benchOptions);
  console.log("Using soak options:", soakOptions);
  await runSoak(benchOptions, soakOptions);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error("❌ Soak test failed", error);
    process.exitCode = 1;
  });
}
