import { describe, expect, it } from "vitest";

import {
  generateBashCompletionScript,
  generatePwshCompletionScript,
  generateZshCompletionScript,
  renderCliHelp,
  SUPPORTED_CLI_COMMANDS,
} from "../index";

describe("renderCliHelp", () => {
  it("produces a multi-section help message", () => {
    const help = renderCliHelp();

    expect(help).toContain("Usage:");
    expect(help).toContain("Commands:");
    expect(help).toContain("Options:");
    expect(help).toContain("Examples:");
    expect(help.endsWith("\n")).toBe(true);
  });

  it("mentions every supported command", () => {
    const help = renderCliHelp();

    for (const command of SUPPORTED_CLI_COMMANDS) {
      expect(help).toContain(`  ${command}`);
    }
  });
});

describe("shell completion generators", () => {
  it("includes commands and flags in the bash script", () => {
    const script = generateBashCompletionScript();

    expect(script).toContain("health-multi");
    for (const command of SUPPORTED_CLI_COMMANDS) {
      expect(script).toContain(command);
    }
    expect(script.endsWith("\n")).toBe(true);
  });

  it("includes commands in the zsh script", () => {
    const script = generateZshCompletionScript();

    expect(script).toContain("#compdef health-multi");
    for (const command of SUPPORTED_CLI_COMMANDS) {
      expect(script).toContain(command);
    }
  });

  it("includes commands in the pwsh script", () => {
    const script = generatePwshCompletionScript();

    expect(script).toContain("Register-ArgumentCompleter");
    for (const command of SUPPORTED_CLI_COMMANDS) {
      expect(script).toContain(command);
    }
  });
});
