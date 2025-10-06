import { CliCommandError } from "./errors";

export const SUPPORTED_CLI_COMMANDS = ["run", "check", "export"] as const;

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
    throw new CliCommandError("A command is required. Expected one of: run, check, export");
  }

  const [commandToken, ...rest] = argv;

  if (!isSupportedCommand(commandToken)) {
    throw new CliCommandError(
      `Unknown command: ${commandToken}. Expected one of: ${SUPPORTED_CLI_COMMANDS.join(", ")}`,
    );
  }

  return { command: commandToken, argv: [...rest] };
}
