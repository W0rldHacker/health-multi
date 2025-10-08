import { CliCommandError } from "./errors";

const HELP_ALIASES = new Set(["help", "--help", "-h"]);

export const SUPPORTED_CLI_COMMANDS = ["run", "check", "export", "help"] as const;

export type CliCommand = (typeof SUPPORTED_CLI_COMMANDS)[number];

export interface ParsedCliCommand {
  command: CliCommand;
  argv: string[];
}

function isSupportedCommand(value: string): value is CliCommand {
  return (SUPPORTED_CLI_COMMANDS as readonly string[]).includes(value);
}

export function parseCliCommand(argv: readonly string[]): ParsedCliCommand {
  if (argv.length === 0) {
    throw new CliCommandError(
      `A command is required. Expected one of: ${SUPPORTED_CLI_COMMANDS.join(", ")}`,
    );
  }

  const [commandToken, ...rest] = argv;

  if (HELP_ALIASES.has(commandToken)) {
    return { command: "help", argv: [...rest] };
  }

  if (!isSupportedCommand(commandToken)) {
    throw new CliCommandError(
      `Unknown command: ${commandToken}. Expected one of: ${SUPPORTED_CLI_COMMANDS.join(", ")}`,
    );
  }

  return { command: commandToken, argv: [...rest] };
}
