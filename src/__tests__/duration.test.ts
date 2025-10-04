import { describe, expect, it } from "vitest";

import {
  DurationParseError,
  formatMillisecondsToDuration,
  parseDurationToMilliseconds,
} from "../duration";

describe("parseDurationToMilliseconds", () => {
  it("parses milliseconds", () => {
    expect(parseDurationToMilliseconds("500ms")).toBe(500);
  });

  it("parses seconds", () => {
    expect(parseDurationToMilliseconds("3s")).toBe(3_000);
  });

  it("parses minutes", () => {
    expect(parseDurationToMilliseconds("2m")).toBe(120_000);
  });

  it("throws for invalid input", () => {
    expect(() => parseDurationToMilliseconds("10seconds")).toThrow(DurationParseError);
  });
});

describe("formatMillisecondsToDuration", () => {
  it("formats minutes when divisible", () => {
    expect(formatMillisecondsToDuration(120_000)).toBe("2m");
  });

  it("formats seconds when divisible", () => {
    expect(formatMillisecondsToDuration(9_000)).toBe("9s");
  });

  it("falls back to milliseconds", () => {
    expect(formatMillisecondsToDuration(750)).toBe("750ms");
  });

  it("throws on invalid milliseconds", () => {
    expect(() => formatMillisecondsToDuration(-1)).toThrow(TypeError);
  });
});
