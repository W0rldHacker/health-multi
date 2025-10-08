import { UsageError } from "../errors";

export class ConfigError extends UsageError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options);
    this.name = "ConfigError";
  }
}

export class ConfigValidationError extends ConfigError {
  constructor(message: string) {
    super(message);
    this.name = "ConfigValidationError";
  }
}

export class MissingEnvironmentVariableError extends ConfigError {
  constructor(variableName: string, context: string) {
    super(`Environment variable ${variableName} referenced in ${context} is not defined`);
    this.name = "MissingEnvironmentVariableError";
  }
}
