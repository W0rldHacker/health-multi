export const REDACTED_PLACEHOLDER = "[redacted]" as const;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Masks a potentially sensitive string value with a static placeholder.
 */
export function redactString(value: string): string {
  return value.length === 0 ? value : REDACTED_PLACEHOLDER;
}

/**
 * Returns a new record with all values replaced by the redaction placeholder.
 */
export function redactRecordValues(
  record: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!record) {
    return undefined;
  }

  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(record)) {
    result[key] = isNonEmptyString(value) ? redactString(value) : REDACTED_PLACEHOLDER;
  }

  return result;
}

/**
 * Masks basic authentication credentials embedded in a URL string while
 * preserving the remainder of the URL for diagnostics.
 */
export function redactUrlCredentials(url: string): string {
  if (!isNonEmptyString(url)) {
    return url;
  }

  return url.replace(/\/\/([^@/?#]*):([^@]*)@/g, (_match, username: string) => {
    return `//${username}:${REDACTED_PLACEHOLDER}@`;
  });
}

/**
 * Convenience helper for optional URL strings.
 */
export function redactOptionalUrlCredentials(url: string | undefined): string | undefined {
  if (typeof url !== "string") {
    return url;
  }

  return redactUrlCredentials(url);
}
