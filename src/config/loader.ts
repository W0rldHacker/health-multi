import { promises as fs } from "node:fs";
import { parse } from "yaml";

import { ConfigError } from "./errors";
import { resolvePlaceholders } from "./placeholders";
import type { RawServicesFile } from "./types";
import { validateServicesConfig } from "./validator";

export interface LoadConfigOptions {
  env?: NodeJS.ProcessEnv;
}

export function parseServicesConfig(
  content: string,
  options: LoadConfigOptions = {},
): RawServicesFile {
  let parsed: unknown;

  try {
    parsed = parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown parse error";
    throw new ConfigError(`Unable to parse services configuration: ${message}`, { cause: error });
  }

  const env = options.env ?? process.env;
  const withEnv = resolvePlaceholders(parsed, env, "config");

  validateServicesConfig(withEnv);

  return withEnv;
}

export async function loadServicesConfig(
  path: string,
  options: LoadConfigOptions = {},
): Promise<RawServicesFile> {
  let raw: string;

  try {
    raw = await fs.readFile(path, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown read error";
    throw new ConfigError(`Unable to read services configuration at ${path}: ${message}`, {
      cause: error,
    });
  }

  return parseServicesConfig(raw, options);
}
