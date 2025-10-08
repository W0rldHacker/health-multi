import type { CliParameters } from "../domain";
import {
  REDACTED_PLACEHOLDER,
  redactOptionalUrlCredentials,
  redactRecordValues,
} from "../redaction";

export interface RedactedCliSnapshot {
  parameters: CliParameters;
}

/**
 * Produces a shallow copy of the CLI parameters with sensitive fields masked
 * for diagnostic logging or testing snapshots.
 */
export function redactCliParameters(parameters: CliParameters): CliParameters {
  const redacted: CliParameters = { ...parameters };

  if (parameters.headers) {
    redacted.headers = redactRecordValues(parameters.headers);
  }

  if (typeof parameters.proxy === "string") {
    const sanitizedProxy = redactOptionalUrlCredentials(parameters.proxy);
    redacted.proxy = sanitizedProxy ?? REDACTED_PLACEHOLDER;
  }

  return redacted;
}
