import { EXIT_CODE_DOWN } from "../exit-codes";
import { HealthMultiError, type ErrorContext } from "./base";

export interface ServiceErrorContext extends Omit<ErrorContext, "serviceName" | "url"> {
  serviceName: string;
  attempt?: number;
  url?: string | URL;
  expectation?: string;
}

function normalizeServiceContext(context: ServiceErrorContext): ErrorContext {
  const normalized: ErrorContext = {
    serviceName: context.serviceName,
  };

  if (typeof context.attempt === "number") {
    normalized.attempt = context.attempt;
  }

  if (context.url instanceof URL) {
    normalized.url = context.url.toString();
  } else if (typeof context.url === "string") {
    normalized.url = context.url;
  }

  if (typeof context.expectation === "string") {
    normalized.expectation = context.expectation;
  }

  return normalized;
}

export interface ServiceProbeErrorOptions {
  cause?: unknown;
}

export class ServiceProbeError extends HealthMultiError {
  readonly serviceName: string;
  readonly attempt?: number;
  readonly url?: string;
  readonly expectation?: string;

  constructor(
    message: string,
    context: ServiceErrorContext,
    options: ServiceProbeErrorOptions = {},
  ) {
    const normalizedContext = normalizeServiceContext(context);
    super(message, {
      exitCode: EXIT_CODE_DOWN,
      context: normalizedContext,
      cause: options.cause,
      name: "ServiceProbeError",
    });

    this.serviceName = context.serviceName;
    this.attempt = context.attempt;
    this.expectation = typeof context.expectation === "string" ? context.expectation : undefined;
    if (context.url instanceof URL) {
      this.url = context.url.toString();
    } else if (typeof context.url === "string") {
      this.url = context.url;
    }
  }
}

export interface ServiceExpectationContext extends ServiceErrorContext {
  expectation: string;
  actual?: string;
}

export class ServiceExpectationError extends ServiceProbeError {
  readonly actual?: string;

  constructor(context: ServiceExpectationContext) {
    const expectationMessage = context.actual
      ? `Expected ${context.expectation}, received ${context.actual}`
      : `Expected ${context.expectation}`;

    super(expectationMessage, context);
    this.name = "ServiceExpectationError";
    this.actual = typeof context.actual === "string" ? context.actual : undefined;
  }
}
