import { type CliParameters, type MissingStatusPolicy } from "../domain";
import { parseDurationToMilliseconds } from "../duration";
import { CliFlagError } from "./errors";

export const DEFAULT_CLI_PARAMETERS: Required<
  Pick<CliParameters, "intervalMs" | "timeoutMs" | "retries" | "concurrency">
> = {
  intervalMs: parseDurationToMilliseconds("15s"),
  timeoutMs: parseDurationToMilliseconds("3s"),
  retries: 1,
  concurrency: 10,
};

function expectValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];

  if (value === undefined) {
    throw new CliFlagError(`Flag ${flag} requires a value`);
  }

  return value;
}

function parseHeader(value: string): [string, string] {
  const separatorIndex = value.indexOf(":");

  if (separatorIndex === -1) {
    throw new CliFlagError(
      "Headers must be specified as 'Name: Value' with a colon separating the key and value",
    );
  }

  const name = value.slice(0, separatorIndex).trim();
  const headerValue = value.slice(separatorIndex + 1).trim();

  if (!name) {
    throw new CliFlagError("Header name must not be empty");
  }

  return [name, headerValue];
}

function parseNonNegativeInteger(value: string, flag: string): number {
  const numeric = Number.parseInt(value, 10);

  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new CliFlagError(`Flag ${flag} must be a non-negative integer`);
  }

  return numeric;
}

function parseMissingStatusPolicy(value: string): MissingStatusPolicy {
  if (value === "degraded" || value === "down") {
    return value;
  }

  throw new CliFlagError("--missing-status must be one of: degraded, down");
}

export interface ParseCliFlagsOptions {
  env?: NodeJS.ProcessEnv;
  warn?: (message: string) => void;
}

function pickProxyFromEnv(env: NodeJS.ProcessEnv): string | undefined {
  const candidates = [env.HTTPS_PROXY, env.HTTP_PROXY];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

export function parseCliFlags(
  argv: readonly string[],
  options: ParseCliFlagsOptions = {},
): CliParameters {
  const env = options.env ?? process.env;
  const warn = options.warn ?? console.warn;

  const result: CliParameters = { ...DEFAULT_CLI_PARAMETERS };
  let insecureFlagUsed = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    switch (token) {
      case "--config": {
        const value = expectValue(argv, index, token);
        result.configPath = value;
        index += 1;
        break;
      }

      case "--interval": {
        const value = expectValue(argv, index, token);
        result.intervalMs = parseDurationToMilliseconds(value);
        index += 1;
        break;
      }

      case "--timeout": {
        const value = expectValue(argv, index, token);
        result.timeoutMs = parseDurationToMilliseconds(value);
        index += 1;
        break;
      }

      case "--retries": {
        const value = expectValue(argv, index, token);
        result.retries = parseNonNegativeInteger(value, token);
        index += 1;
        break;
      }

      case "--concurrency": {
        const value = expectValue(argv, index, token);
        result.concurrency = parseNonNegativeInteger(value, token);
        index += 1;
        break;
      }

      case "--proxy": {
        const value = expectValue(argv, index, token);
        result.proxy = value;
        index += 1;
        break;
      }

      case "--headers": {
        const value = expectValue(argv, index, token);
        const [name, headerValue] = parseHeader(value);
        result.headers = { ...(result.headers ?? {}), [name]: headerValue };
        index += 1;
        break;
      }

      case "--insecure": {
        result.insecure = true;
        insecureFlagUsed = true;
        break;
      }

      case "--debug": {
        result.debug = true;
        break;
      }

      case "--missing-status": {
        const value = expectValue(argv, index, token);
        result.missingStatusPolicy = parseMissingStatusPolicy(value);
        index += 1;
        break;
      }

      default: {
        throw new CliFlagError(`Unknown flag: ${token}`);
      }
    }
  }

  if (result.proxy === undefined) {
    const envProxy = pickProxyFromEnv(env);
    if (envProxy) {
      result.proxy = envProxy;
    }
  }

  if (insecureFlagUsed) {
    warn(
      "Warning: TLS certificate verification is disabled (--insecure). Do not use this option in production.",
    );
  }

  return result;
}
