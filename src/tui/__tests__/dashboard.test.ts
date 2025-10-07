import { describe, expect, it } from "vitest";

import { type DashboardState, type ServiceRow, renderDashboard } from "../index";

describe("renderDashboard", () => {
  const services: ServiceRow[] = [
    {
      name: "api",
      status: "ok",
      latencyMs: 123.4,
      version: "1.2.3",
      region: "eu-central-1",
      ageMs: 15_000,
      tags: ["prod", "eu"],
    },
    {
      name: "auth",
      status: "degraded",
      latencyMs: 987.6,
      version: "2.0.0",
      region: "us-east-1",
      ageMs: 90_000,
      tags: ["stage"],
    },
  ];

  const baseState: DashboardState = {
    aggregateStatus: "ok",
    serviceCount: services.length,
    lastCompletedAt: new Date("2024-01-01T12:00:00.000Z"),
    services,
  };

  it("renders header, hints and table", () => {
    const output = renderDashboard(baseState, 100);
    const lines = output.split("\n");

    expect(lines[0]).toBe("Aggregate: OK | Services: 2 | Last tick: 2024-01-01T12:00:00.000Z");
    expect(lines[1]).toBe("Keys: [f]ilter  [/] search  [s] sort  [q] quit");
    expect(lines[2]).toContain("Name");
    expect(lines[3]).toMatch(/^[─┼]+$/u);
    expect(lines[4]).toContain("api");
  });

  it("adjusts table width to the available terminal size", () => {
    const terminalWidth = 70;
    const output = renderDashboard(baseState, terminalWidth);
    const lines = output.split("\n");
    const tableLines = lines.slice(2);

    for (const line of tableLines) {
      expect(line.length).toBeLessThanOrEqual(terminalWidth);
    }
  });

  it("formats fallbacks for missing data", () => {
    const state: DashboardState = {
      aggregateStatus: "down",
      serviceCount: 1,
      lastCompletedAt: undefined,
      services: [
        {
          name: "cache",
        },
      ],
    };

    const output = renderDashboard(state, 90);
    const lines = output.split("\n");

    expect(lines[0]).toBe("Aggregate: DOWN | Services: 1 | Last tick: —");
    expect(lines[4]).toContain("cache");
    expect(lines[4]).toContain("—");
  });
});
