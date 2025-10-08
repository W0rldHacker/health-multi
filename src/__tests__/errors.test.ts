import { describe, expect, it } from "vitest";

import {
  EXIT_CODE_CONFIG_ERROR,
  EXIT_CODE_DOWN,
  formatErrorMessageWithContext,
  ServiceExpectationError,
  ServiceProbeError,
  UsageError,
} from "../index";

describe("error hierarchy", () => {
  it("formats error messages with provided context", () => {
    const message = formatErrorMessageWithContext("Request failed", {
      serviceName: "api",
      attempt: 2,
      url: "https://api.example.com/health",
      expectation: "status=ok",
    });

    expect(message).toBe(
      "Request failed (service=api, attempt=2, url=https://api.example.com/health, expected=status=ok)",
    );
  });

  it("captures exit codes for usage errors", () => {
    const error = new UsageError("Invalid flag");

    expect(error.exitCode).toBe(EXIT_CODE_CONFIG_ERROR);
    expect(error).toBeInstanceOf(Error);
  });

  it("provides contextual messages for service probe errors", () => {
    const error = new ServiceProbeError("Request timed out", {
      serviceName: "auth",
      attempt: 1,
      url: new URL("https://auth.example.com/health"),
      expectation: "status=ok",
    });

    expect(error.exitCode).toBe(EXIT_CODE_DOWN);
    expect(error.message).toBe(
      "Request timed out (service=auth, attempt=1, url=https://auth.example.com/health, expected=status=ok)",
    );
  });

  it("adds expectation details to service expectation errors", () => {
    const error = new ServiceExpectationError({
      serviceName: "web",
      attempt: 3,
      url: "https://web.example.com/health",
      expectation: "status=ok",
      actual: "status=down",
    });

    expect(error.message).toBe(
      "Expected status=ok, received status=down (service=web, attempt=3, url=https://web.example.com/health, expected=status=ok)",
    );
  });
});
