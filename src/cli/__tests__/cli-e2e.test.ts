import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const TSX_CLI_PATH = require.resolve("tsx/cli");
const CLI_ENTRY = path.resolve(__dirname, "../../bin.ts");

interface CliExecution {
  stdout: string;
  stderr: string;
  exitCode: number;
}

vi.setConfig({ testTimeout: 15000 });

function sanitizeNodeOptions(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }

  const tokens = value
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !/^--inspect(?:-brk)?(?:=.*)?$/u.test(token));

  if (tokens.length === 0) {
    return undefined;
  }

  return tokens.join(" ");
}

function sanitizeNodeOptionsFromEnv(env: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() !== "NODE_OPTIONS") {
      continue;
    }

    const sanitizedNodeOptions = sanitizeNodeOptions(env[key]);

    if (sanitizedNodeOptions === undefined) {
      delete env[key];
    } else {
      env[key] = sanitizedNodeOptions;
    }
  }
}

function runCli(args: string[], env?: NodeJS.ProcessEnv): Promise<CliExecution> {
  return new Promise((resolve, reject) => {
    const mergedEnv = { ...process.env, ...env };
    sanitizeNodeOptionsFromEnv(mergedEnv);

    const child = spawn(process.execPath, [TSX_CLI_PATH, CLI_ENTRY, ...args], {
      env: mergedEnv,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 0,
      });
    });
  });
}

function createTempConfigFile(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "health-multi-e2e-"));
  const filePath = path.join(directory, `services-${randomUUID()}.yaml`);
  writeFileSync(
    filePath,
    [
      "interval: 15s",
      "services:",
      "  - name: api",
      "    url: http://localhost:3101/health",
      "  - name: auth",
      "    url: http://localhost:3102/health",
      "  - name: billing",
      "    url: http://localhost:3103/health",
      "",
    ].join("\n"),
    "utf8",
  );
  return filePath;
}

describe("health-multi CLI end-to-end", () => {
  it("prints contextual help when invoked without arguments", async () => {
    const result = await runCli([]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("Commands:");
  });

  it("emits the CLI version when requested", async () => {
    const result = await runCli(["--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim()).toMatch(/^health-multi \d+\.\d+\.\d+$/u);
  });

  it("reports parsed parameters and redacts sensitive values for run command", async () => {
    const configPath = createTempConfigFile();
    const result = await runCli(
      ["run", "--config", configPath, "--headers", "Authorization: Bearer secret", "--insecure"],
      {
        HTTPS_PROXY: "http://ops:topsecret@proxy.internal:8080",
      },
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("--insecure disables TLS certificate verification");

    const payload = JSON.parse(result.stdout) as {
      command: string;
      parameters: { headers?: Record<string, string>; proxy?: string };
    };

    expect(payload.command).toBe("run");
    expect(payload.parameters.headers).toEqual({ Authorization: "[redacted]" });
    expect(payload.parameters.proxy).toBe("http://ops:[redacted]@proxy.internal:8080");
  });

  it("produces shell completion scripts", async () => {
    const bashResult = await runCli(["--completion=bash"]);
    expect(bashResult.exitCode).toBe(0);
    expect(bashResult.stdout).toContain("_health_multi()");
    expect(bashResult.stderr).toBe("");

    const zshResult = await runCli(["--completion=zsh"]);
    expect(zshResult.exitCode).toBe(0);
    expect(zshResult.stdout).toContain("#compdef health-multi");
    expect(zshResult.stderr).toBe("");
  });
});
