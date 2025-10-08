import { SUPPORTED_CLI_COMMANDS } from "./commands";

const PRIMARY_COMMANDS = [
  {
    name: "run" as const,
    summary: "Launch the interactive TUI dashboard that continuously probes services.",
  },
  {
    name: "check" as const,
    summary: "Execute a single health check cycle and print the aggregated result to stdout.",
  },
  {
    name: "export" as const,
    summary:
      "Probe services on an interval and emit metrics suitable for Prometheus textfile scraping.",
  },
  {
    name: "help" as const,
    summary: "Show this help message and exit.",
  },
] as const;

const GLOBAL_OPTIONS = [
  {
    flag: "--config <path>",
    description: "Path to the services definition file (YAML or JSON).",
  },
  {
    flag: "--interval <duration>",
    description: "Delay between probe cycles, e.g. 15s, 1m (default: 15s).",
  },
  {
    flag: "--timeout <duration>",
    description: "Maximum time allowed for an individual HTTP request (default: 3s).",
  },
  {
    flag: "--retries <number>",
    description: "Number of retry attempts when a probe fails (default: 1).",
  },
  {
    flag: "--concurrency <number>",
    description: "Maximum number of probes executed in parallel (default: 10).",
  },
  {
    flag: "--proxy <url>",
    description: "Forward requests through an HTTP proxy. Also honours HTTPS_PROXY / HTTP_PROXY.",
  },
  {
    flag: "--headers 'Name: Value'",
    description: "Attach additional HTTP headers to every request. Can be provided multiple times.",
  },
  {
    flag: "--missing-status <degraded|down>",
    description: "Fallback status to use when responses omit an explicit status field.",
  },
  {
    flag: "--out <json|ndjson>",
    description: "Select output format for check results (default: json).",
  },
  {
    flag: "--insecure",
    description: "Disable TLS certificate verification (intended for trusted development setups).",
  },
  {
    flag: "--debug",
    description: "Enable verbose HTTP diagnostics, including DNS/TCP/TLS timing breakdowns.",
  },
  {
    flag: "--help, -h",
    description: "Show this help message and exit.",
  },
] as const;

const EXAMPLES = [
  "health-multi run --config ./services.yaml",
  "health-multi check --config ./services.yaml --out ndjson --retries 2",
  "health-multi export --config ./services.yaml --interval 30s --proxy http://proxy.internal:8080",
] as const;

const COMPLETION_FLAGS = [
  "--config",
  "--interval",
  "--timeout",
  "--retries",
  "--concurrency",
  "--proxy",
  "--headers",
  "--missing-status",
  "--out",
  "--insecure",
  "--debug",
  "--help",
  "-h",
] as const;

function formatColumns(rows: readonly { left: string; right: string }[], padding = 2): string {
  const leftWidth = rows.reduce((max, row) => Math.max(max, row.left.length), 0);

  return rows
    .map((row) => {
      const left = row.left.padEnd(leftWidth + padding, " ");
      return `${left}${row.right}`.trimEnd();
    })
    .join("\n");
}

function joinLines(lines: readonly string[]): string {
  return `${lines.join("\n")}\n`;
}

export function renderCliHelp(): string {
  const sections: string[] = [];

  sections.push("health-multi — parallel health probing for many services");
  sections.push("");
  sections.push("Usage:");
  sections.push("  health-multi <command> [options]");
  sections.push("");
  sections.push("Commands:");
  sections.push(
    formatColumns(
      PRIMARY_COMMANDS.map(({ name, summary }) => ({
        left: `  ${name}`,
        right: summary,
      })),
    ),
  );
  sections.push("");
  sections.push("Options:");
  sections.push(
    formatColumns(
      GLOBAL_OPTIONS.map(({ flag, description }) => ({
        left: `  ${flag}`,
        right: description,
      })),
    ),
  );
  sections.push("");
  sections.push("Examples:");

  for (const example of EXAMPLES) {
    sections.push(`  $ ${example}`);
  }

  return joinLines(sections);
}

export function generateBashCompletionScript(): string {
  const commandList = SUPPORTED_CLI_COMMANDS.join(" ");
  const flagList = COMPLETION_FLAGS.join(" ");

  const lines = [
    "#!/usr/bin/env bash",
    "_health_multi()",
    "{",
    "  local cur prev",
    "  COMPREPLY=()",
    '  cur="${COMP_WORDS[COMP_CWORD]}"',
    '  prev="${COMP_WORDS[COMP_CWORD-1]}"',
    "",
    "  if [[ ${COMP_CWORD} -eq 1 ]]; then",
    `    COMPREPLY=( $(compgen -W "${commandList}" -- "$cur") )`,
    "    return 0",
    "  fi",
    "",
    '  case "$prev" in',
    "    run|check|export|help)",
    `      COMPREPLY=( $(compgen -W "${flagList}" -- "$cur") )`,
    "      return 0",
    "      ;;",
    "  esac",
    "",
    `  COMPREPLY=( $(compgen -W "${flagList}" -- "$cur") )`,
    "  return 0",
    "}",
    "complete -F _health_multi health-multi",
  ];

  return joinLines(lines);
}

export function generateZshCompletionScript(): string {
  const commandList = SUPPORTED_CLI_COMMANDS.join(" ");
  const optionLines = GLOBAL_OPTIONS.map(({ flag, description }) => {
    const primaryFlag = flag.split(",")[0]?.trim() ?? flag;
    return `    "${primaryFlag}[${description}]"`;
  });

  const lines = [
    "#compdef health-multi",
    "",
    "_arguments \\",
    `  "1:command:(${commandList})" \\`,
    '  "*::options:->options"',
    "",
    "case $state in",
    "  (options)",
    ...optionLines.slice(0, -1).map((entry) => `${entry} \\`),
    optionLines.length > 0 ? optionLines[optionLines.length - 1] : "",
    "    ;;",
    "esac",
  ].filter((line) => line.length > 0);

  return joinLines(lines);
}

export function generatePwshCompletionScript(): string {
  const commandList = SUPPORTED_CLI_COMMANDS.map((command) => `'${command}'`).join(", ");
  const flagList = COMPLETION_FLAGS.map((flag) => `'${flag}'`).join(", ");

  const lines = [
    "Register-ArgumentCompleter -CommandName 'health-multi' -ScriptBlock {",
    "  param($commandName, $parameterName, $wordToComplete, $commandAst, $fakeBoundParameters)",
    "",
    `  $commands = @(${commandList})`,
    `  $options = @(${flagList})`,
    "",
    "  if ($commandAst.CommandElements.Count -le 1) {",
    "    foreach ($item in $commands) {",
    '      if ($item -like "$wordToComplete*") {',
    "        [System.Management.Automation.CompletionResult]::new($item, $item, 'ParameterValue', $item)",
    "      }",
    "    }",
    "    return",
    "  }",
    "",
    "  foreach ($option in $options) {",
    '    if ($option -like "$wordToComplete*") {',
    "      [System.Management.Automation.CompletionResult]::new($option, $option, 'ParameterName', $option)",
    "    }",
    "  }",
    "}",
  ];

  return joinLines(lines);
}
