import { describe, expect, it } from "vitest";

import type { NormalizedStatus } from "../../domain";
import { parseCliCommand, parseCliFlags, exitCodeFromAggregateStatus } from "../index";

interface SimulateCliOptions {
  env?: NodeJS.ProcessEnv;
  aggregateStatus?: NormalizedStatus;
}

interface SimulatedCliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function simulateCliExecution(
  args: string[],
  options: SimulateCliOptions = {},
): SimulatedCliResult {
  const { aggregateStatus = "ok", env = {} } = options;

  const warnings: string[] = [];

  const { command, argv } = parseCliCommand(args);
  const parameters = parseCliFlags(argv, {
    env,
    warn: (message: string) => {
      warnings.push(message);
    },
  });

  return {
    stdout: `${JSON.stringify({ command, aggregateStatus, parameters }, null, 2)}\n`,
    stderr: warnings.length > 0 ? `${warnings.join("\n")}\n` : "",
    exitCode: exitCodeFromAggregateStatus(aggregateStatus),
  };
}

describe("CLI process snapshots", () => {
  it("captures stdout, stderr, and exit code for a degraded check run", () => {
    const result = simulateCliExecution(
      [
        "check",
        "--config",
        "./services.yaml",
        "--interval",
        "30s",
        "--timeout",
        "1s",
        "--retries",
        "2",
        "--concurrency",
        "5",
        "--headers",
        "Authorization: Bearer token",
        "--missing-status",
        "degraded",
        "--insecure",
      ],
      { aggregateStatus: "degraded" },
    );

    const stdoutPayload = JSON.parse(result.stdout) as unknown;

    expect(stdoutPayload).toMatchInlineSnapshot(`
{
  "aggregateStatus": "degraded",
  "command": "check",
  "parameters": {
    "concurrency": 5,
    "configPath": "./services.yaml",
    "headers": {
      "Authorization": "Bearer token",
    },
    "insecure": true,
    "intervalMs": 30000,
    "missingStatusPolicy": "degraded",
    "outputFormat": "json",
    "retries": 2,
    "timeoutMs": 1000,
  },
}
    `);

    expect(result.stdout.endsWith("\n")).toBe(true);

    const stderrLines = result.stderr.split("\n").filter((line) => line.length > 0);

    expect(stderrLines).toMatchInlineSnapshot(`
[
  "Warning: TLS certificate verification is disabled (--insecure). Do not use this option in production.",
]
    `);

    expect(result.stderr.endsWith("\n")).toBe(true);

    expect(result.exitCode).toBe(1);
  });

  it("emits no stderr output and exits with success when aggregate status is ok", () => {
    const result = simulateCliExecution(["run", "--config", "./services.yaml"], {
      aggregateStatus: "ok",
    });

    const stdoutPayload = JSON.parse(result.stdout) as unknown;

    expect(stdoutPayload).toMatchInlineSnapshot(`
{
  "aggregateStatus": "ok",
  "command": "run",
  "parameters": {
    "concurrency": 10,
    "configPath": "./services.yaml",
    "intervalMs": 15000,
    "outputFormat": "json",
    "retries": 1,
    "timeoutMs": 3000,
  },
}
    `);

    expect(result.stdout.endsWith("\n")).toBe(true);

    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });
});
