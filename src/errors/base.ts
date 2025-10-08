import { EXIT_CODE_CONFIG_ERROR, EXIT_CODE_INTERNAL_ERROR, type ExitCode } from "../exit-codes";

export interface ErrorContext {
  serviceName?: string;
  attempt?: number;
  url?: string;
  expectation?: string;
}

export interface HealthMultiErrorOptions {
  exitCode: ExitCode;
  context?: ErrorContext;
  cause?: unknown;
  name?: string;
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function sanitizeUrl(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof URL) {
    return value.toString();
  }

  return undefined;
}

export function formatErrorMessageWithContext(message: string, context?: ErrorContext): string {
  if (!context) {
    return message;
  }

  const details: string[] = [];

  if (typeof context.serviceName === "string" && context.serviceName.length > 0) {
    details.push(`service=${context.serviceName}`);
  }

  if (isFiniteInteger(context.attempt)) {
    details.push(`attempt=${context.attempt}`);
  }

  const url = sanitizeUrl(context.url);
  if (url) {
    details.push(`url=${url}`);
  }

  if (typeof context.expectation === "string" && context.expectation.length > 0) {
    details.push(`expected=${context.expectation}`);
  }

  if (details.length === 0) {
    return message;
  }

  return `${message} (${details.join(", ")})`;
}

export class HealthMultiError extends Error {
  readonly exitCode: ExitCode;
  readonly context?: ErrorContext;

  constructor(message: string, options: HealthMultiErrorOptions) {
    const formatted = formatErrorMessageWithContext(message, options.context);
    super(formatted);

    this.exitCode = options.exitCode;
    this.context = options.context;
    this.name = options.name ?? new.target.name;

    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export interface UsageErrorOptions {
  context?: ErrorContext;
  cause?: unknown;
}

export class UsageError extends HealthMultiError {
  constructor(message: string, options: UsageErrorOptions = {}) {
    super(message, {
      exitCode: EXIT_CODE_CONFIG_ERROR,
      context: options.context,
      cause: options.cause,
      name: "UsageError",
    });
  }
}

export interface InternalErrorOptions {
  context?: ErrorContext;
  cause?: unknown;
}

export class InternalError extends HealthMultiError {
  constructor(message: string, options: InternalErrorOptions = {}) {
    super(message, {
      exitCode: EXIT_CODE_INTERNAL_ERROR,
      context: options.context,
      cause: options.cause,
      name: "InternalError",
    });
  }
}
