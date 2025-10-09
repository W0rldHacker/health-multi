#!/usr/bin/env node
import process from "node:process";

import packageJson from "../package.json";
import { parseCliCommand, parseCliFlags } from "./cli";
import { CliFlagError } from "./cli/errors";
import {
  generateBashCompletionScript,
  generatePwshCompletionScript,
  generateZshCompletionScript,
  renderCliHelp,
} from "./cli/help";
import { redactCliParameters } from "./cli/redaction";
import { HealthMultiError } from "./errors";
import { exitCodeFromAggregateStatus, EXIT_CODE_INTERNAL_ERROR } from "./exit-codes";

const COMPLETION_FLAG_PATTERN = /^--completion=(?<shell>bash|zsh|pwsh)$/;
const VERSION_FLAGS = new Set(["--version", "-v"]);
const HELP_FLAGS = new Set(["--help", "-h"]);

interface CliOutcome {
  code: number;
}

function printVersion(): CliOutcome {
  const version = typeof packageJson.version === "string" ? packageJson.version : "0.0.0";
  process.stdout.write(`health-multi ${version}\n`);
  return { code: 0 };
}

function printHelp(): CliOutcome {
  process.stdout.write(renderCliHelp());
  return { code: 0 };
}

function printCompletionScript(shell: "bash" | "zsh" | "pwsh"): CliOutcome {
  switch (shell) {
    case "bash":
      process.stdout.write(generateBashCompletionScript());
      break;
    case "zsh":
      process.stdout.write(generateZshCompletionScript());
      break;
    case "pwsh":
      process.stdout.write(generatePwshCompletionScript());
      break;
  }

  return { code: 0 };
}

function runNotImplementedCommand(command: string, argv: readonly string[]): CliOutcome {
  const warnings: string[] = [];

  try {
    const parameters = parseCliFlags(argv, {
      env: process.env,
      warn: (message: string) => {
        warnings.push(message);
      },
    });

    if (warnings.length > 0) {
      process.stderr.write(`${warnings.join("\n")}\n`);
    }

    const redacted = redactCliParameters(parameters);
    const payload = {
      command,
      parameters: redacted,
      note: "The execution engine is not yet wired up. Refer to the documentation for the current project roadmap.",
    };

    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } catch (error) {
    if (error instanceof CliFlagError) {
      process.stderr.write(`${error.message}\n`);
      return { code: error.exitCode };
    }

    throw error;
  }

  return { code: exitCodeFromAggregateStatus("down") };
}

function normalizeTopLevel(args: string[]): {
  rest: string[];
  completion?: "bash" | "zsh" | "pwsh";
} {
  const rest: string[] = [];
  let completion: "bash" | "zsh" | "pwsh" | undefined;

  for (const token of args) {
    const match = token.match(COMPLETION_FLAG_PATTERN);
    if (match && match.groups) {
      completion = match.groups.shell as "bash" | "zsh" | "pwsh";
      continue;
    }

    rest.push(token);
  }

  return { rest, completion };
}

function main(): CliOutcome {
  const rawArgs = process.argv.slice(2);

  const { rest, completion } = normalizeTopLevel(rawArgs);

  if (completion) {
    return printCompletionScript(completion);
  }

  if (rest.some((token) => VERSION_FLAGS.has(token))) {
    return printVersion();
  }

  if (rest.length === 0 || rest.some((token) => HELP_FLAGS.has(token))) {
    return printHelp();
  }

  try {
    const { command, argv } = parseCliCommand(rest);

    if (command === "help") {
      return printHelp();
    }

    return runNotImplementedCommand(command, argv);
  } catch (error) {
    if (error instanceof HealthMultiError) {
      process.stderr.write(`${error.message}\n`);
      return { code: error.exitCode };
    }

    if (error instanceof Error) {
      process.stderr.write(`${error.message}\n`);
      return { code: EXIT_CODE_INTERNAL_ERROR };
    }

    process.stderr.write(`Unexpected error: ${String(error)}\n`);
    return { code: EXIT_CODE_INTERNAL_ERROR };
  }
}

const outcome = main();
process.exitCode = outcome.code;
