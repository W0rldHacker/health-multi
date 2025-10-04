import { describe, expect, it } from "vitest";

import { CliFlagError, parseCliFlags } from "../index";

describe("parseCliFlags", () => {
  it("returns default values when no flags provided", () => {
    expect(parseCliFlags([])).toMatchObject({
      intervalMs: 15_000,
      timeoutMs: 3_000,
      retries: 1,
      concurrency: 10,
    });
  });

  it("parses duration overrides", () => {
    expect(parseCliFlags(["--interval", "30s", "--timeout", "500ms"])).toMatchObject({
      intervalMs: 30_000,
      timeoutMs: 500,
    });
  });

  it("parses numeric overrides", () => {
    expect(parseCliFlags(["--retries", "3", "--concurrency", "20"])).toMatchObject({
      retries: 3,
      concurrency: 20,
    });
  });

  it("parses headers", () => {
    expect(parseCliFlags(["--headers", "Authorization: Bearer token"])).toMatchObject({
      headers: { Authorization: "Bearer token" },
    });
  });

  it("sets insecure flag", () => {
    expect(parseCliFlags(["--insecure"])).toMatchObject({ insecure: true });
  });

  it("throws on unknown flag", () => {
    expect(() => parseCliFlags(["--unknown"])).toThrow(CliFlagError);
  });

  it("throws when required value is missing", () => {
    expect(() => parseCliFlags(["--interval"])).toThrow(/requires a value/);
  });

  it("validates header format", () => {
    expect(() => parseCliFlags(["--headers", "InvalidHeader"])).toThrow(
      /Headers must be specified/,
    );
  });
});
