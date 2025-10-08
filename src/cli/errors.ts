import { UsageError } from "../errors";

export class CliFlagError extends UsageError {
  constructor(message: string) {
    super(message);
    this.name = "CliFlagError";
  }
}

export class CliCommandError extends UsageError {
  constructor(message: string) {
    super(message);
    this.name = "CliCommandError";
  }
}
