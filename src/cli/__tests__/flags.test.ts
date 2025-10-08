import { describe, expect, it, vi } from "vitest";

import { CliFlagError, parseCliFlags } from "../index";

describe("parseCliFlags", () => {
  const baseOptions: NonNullable<Parameters<typeof parseCliFlags>[1]> = {
    env: {},
    warn: () => {},
  };

  it("returns default values when no flags provided", () => {
    expect(parseCliFlags([], baseOptions)).toMatchObject({
      intervalMs: 15_000,
      timeoutMs: 3_000,
      retries: 1,
      concurrency: 10,
      outputFormat: "json",
    });
  });

  it("parses duration overrides", () => {
    expect(parseCliFlags(["--interval", "30s", "--timeout", "500ms"], baseOptions)).toMatchObject({
      intervalMs: 30_000,
      timeoutMs: 500,
    });
  });

  it("parses numeric overrides", () => {
    expect(parseCliFlags(["--retries", "3", "--concurrency", "20"], baseOptions)).toMatchObject({
      retries: 3,
      concurrency: 20,
    });
  });

  it("parses headers", () => {
    expect(parseCliFlags(["--headers", "Authorization: Bearer token"], baseOptions)).toMatchObject({
      headers: { Authorization: "Bearer token" },
    });
  });

  it("parses output format", () => {
    expect(parseCliFlags(["--out", "ndjson"], baseOptions)).toMatchObject({
      outputFormat: "ndjson",
    });
  });

  it("parses configuration path", () => {
    expect(parseCliFlags(["--config", "./services.yaml"], baseOptions)).toMatchObject({
      configPath: "./services.yaml",
    });
  });

  it("enables debug mode", () => {
    expect(parseCliFlags(["--debug"], baseOptions)).toMatchObject({ debug: true });
  });

  it("sets insecure flag", () => {
    expect(parseCliFlags(["--insecure"], baseOptions)).toMatchObject({ insecure: true });
  });

  it("throws on unknown flag", () => {
    expect(() => parseCliFlags(["--unknown"], baseOptions)).toThrow(CliFlagError);
  });

  it("throws when required value is missing", () => {
    expect(() => parseCliFlags(["--interval"], baseOptions)).toThrow(/requires a value/);
  });

  it("validates header format", () => {
    expect(() => parseCliFlags(["--headers", "InvalidHeader"], baseOptions)).toThrow(
      /Headers must be specified/,
    );
  });

  it("prefers proxy from CLI over environment", () => {
    const params = parseCliFlags(["--proxy", "http://cli"], {
      env: { HTTPS_PROXY: "http://env" },
      warn: () => {},
    });

    expect(params.proxy).toBe("http://cli");
  });

  it("falls back to HTTPS proxy from environment when not provided via CLI", () => {
    const params = parseCliFlags([], {
      env: { HTTPS_PROXY: "http://env" },
      warn: () => {},
    });

    expect(params.proxy).toBe("http://env");
  });

  it("emits a warning when --insecure is used", () => {
    const warn = vi.fn();

    parseCliFlags(["--insecure"], { env: {}, warn });

    expect(warn).toHaveBeenCalledWith(
      "Warning: --insecure disables TLS certificate verification. Connections may be intercepted. Limit usage to trusted development or lab environments.",
    );
  });
});
