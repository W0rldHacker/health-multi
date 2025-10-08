import { describe, expect, it } from "vitest";

import { CliCommandError, parseCliCommand, SUPPORTED_CLI_COMMANDS } from "../index";

describe("parseCliCommand", () => {
  it.each(SUPPORTED_CLI_COMMANDS)("parses %s command", (command) => {
    const result = parseCliCommand([command]);

    expect(result).toEqual({ command, argv: [] });
  });

  it("returns remaining argv after the command token", () => {
    const argv = ["check", "--config", "./services.yaml", "--debug"];

    const result = parseCliCommand(argv);

    expect(result.command).toBe("check");
    expect(result.argv).toEqual(["--config", "./services.yaml", "--debug"]);
  });

  it.each([["--help"], ["-h"], ["help"]])("normalizes %s to the help command", (token) => {
    const result = parseCliCommand([token]);

    expect(result).toEqual({ command: "help", argv: [] });
  });

  it("throws when no command is provided", () => {
    expect(() => parseCliCommand([])).toThrow(CliCommandError);
  });

  it("throws when command is not supported", () => {
    expect(() => parseCliCommand(["deploy"])).toThrow(/Unknown command/);
  });
});
