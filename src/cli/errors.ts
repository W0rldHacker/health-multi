export class CliFlagError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliFlagError";
  }
}

export class CliCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliCommandError";
  }
}
