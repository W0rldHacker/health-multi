import { describe, expect, it } from "vitest";

import {
  EXIT_CODE_CONFIG_ERROR,
  EXIT_CODE_DEGRADED,
  EXIT_CODE_DOWN,
  EXIT_CODE_INTERNAL_ERROR,
  EXIT_CODE_OK,
  exitCodeFromAggregateStatus,
} from "../exit-codes";

describe("exitCodeFromAggregateStatus", () => {
  it("returns the ok exit code when aggregate status is ok", () => {
    expect(exitCodeFromAggregateStatus("ok")).toBe(EXIT_CODE_OK);
  });

  it("returns the degraded exit code when aggregate status is degraded", () => {
    expect(exitCodeFromAggregateStatus("degraded")).toBe(EXIT_CODE_DEGRADED);
  });

  it("returns the down exit code when aggregate status is down", () => {
    expect(exitCodeFromAggregateStatus("down")).toBe(EXIT_CODE_DOWN);
  });
});

describe("static exit code contracts", () => {
  it("matches the specification for config errors", () => {
    expect(EXIT_CODE_CONFIG_ERROR).toBe(3);
  });

  it("matches the specification for internal errors", () => {
    expect(EXIT_CODE_INTERNAL_ERROR).toBe(4);
  });
});
