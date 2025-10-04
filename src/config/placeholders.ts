import { MissingEnvironmentVariableError } from "./errors";

const PLACEHOLDER_PATTERN = /\$\{([A-Z0-9_]+)\}/g;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

function replaceInString(value: string, env: NodeJS.ProcessEnv, context: string): string {
  return value.replace(PLACEHOLDER_PATTERN, (match, variableName: string) => {
    const replacement = env[variableName];

    if (typeof replacement === "undefined") {
      throw new MissingEnvironmentVariableError(variableName, context);
    }

    return replacement;
  });
}

export function resolvePlaceholders(
  value: unknown,
  env: NodeJS.ProcessEnv,
  context: string,
): unknown {
  if (typeof value === "string") {
    return replaceInString(value, env, context);
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => resolvePlaceholders(item, env, `${context}[${index}]`));
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};

    for (const [key, nested] of Object.entries(value)) {
      result[key] = resolvePlaceholders(nested, env, `${context}.${key}`);
    }

    return result;
  }

  return value;
}
