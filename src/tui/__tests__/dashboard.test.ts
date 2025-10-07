import { describe, expect, it } from "vitest";

import {
  type DashboardState,
  type ServiceDetailPane,
  type ServiceRow,
  renderDashboard,
} from "../index";

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
      url: "https://api.example.com/health",
    },
    {
      name: "auth",
      status: "degraded",
      latencyMs: 987.6,
      version: "2.0.0",
      region: "us-east-1",
      ageMs: 90_000,
      tags: ["stage"],
      url: "https://auth.example.com/health",
    },
  ];

  const baseState: DashboardState = {
    aggregateStatus: "ok",
    serviceCount: services.length,
    lastCompletedAt: new Date("2024-01-01T12:00:00.000Z"),
    services,
    colorMode: "no-color",
  };

  it("renders header, context, hints and table", () => {
    const output = renderDashboard(
      {
        ...baseState,
        filters: "tag:prod",
        searchQuery: "api",
        sort: { by: "latency", direction: "asc" },
      },
      100,
    );
    const lines = output.split("\n");

    expect(lines[0]).toBe("Aggregate: OK | Services: 2 | Last tick: 2024-01-01T12:00:00.000Z");
    expect(lines[1]).toBe('Filters: tag:prod | Search: "api" | Sort: latency ↑ | Matches: 1/2');
    expect(lines[2]).toBe("Keys: [f]ilter  [/] search  [s] sort  [q] quit");
    expect(lines[3]).toContain("Name");
    expect(lines[4]).toMatch(/^[─┼]+$/u);
    expect(lines[5]).toContain("api");
    expect(lines[5]).not.toContain("auth");
  });

  it("adjusts table width to the available terminal size", () => {
    const terminalWidth = 70;
    const output = renderDashboard(baseState, terminalWidth);
    const lines = output.split("\n");
    const tableLines = lines.slice(3);

    for (const line of tableLines) {
      expect(line.length).toBeLessThanOrEqual(terminalWidth);
    }
  });

  it("formats fallbacks for missing data", () => {
    const state: DashboardState = {
      aggregateStatus: "down",
      serviceCount: 1,
      lastCompletedAt: undefined,
      colorMode: "no-color",
      services: [
        {
          name: "cache",
        },
      ],
    };

    const output = renderDashboard(state, 90);
    const lines = output.split("\n");

    expect(lines[0]).toBe("Aggregate: DOWN | Services: 1 | Last tick: —");
    expect(lines[1]).toBe("Filters: none | Search: — | Sort: name ↑ | Matches: 1/1");
    expect(lines[5]).toContain("cache");
    expect(lines[5]).toContain("—");
  });

  it("sorts by latency descending", () => {
    const output = renderDashboard(
      {
        ...baseState,
        sort: { by: "latency", direction: "desc" },
      },
      100,
    );
    const lines = output.split("\n");
    const firstDataRow = lines[5];

    expect(firstDataRow).toContain("auth");
  });

  it("renders detail pane with sparkline and metadata", () => {
    const detailPane: ServiceDetailPane = {
      service: services[0],
      latencyHistoryMs: [10, 20, 40, 80],
      responseJson: { status: "ok", version: "1.2.3" },
      responseHeaders: { "content-type": "application/json" },
      historyWindow: 4,
      capturedAt: new Date("2024-01-01T12:00:00.000Z"),
    };

    const output = renderDashboard(
      {
        ...baseState,
        detailPane,
      },
      100,
    );
    const lines = output.split("\n");

    expect(lines.some((line) => /^─{20,}$/u.test(line))).toBe(true);
    expect(output).toContain("Detail: api");
    expect(output).toContain("Latency sparkline (last 4):");
    expect(output).toContain("Last response JSON:");
    expect(output).toContain('\n  {\n    "status": "ok",\n    "version": "1.2.3"\n  }\n');
    expect(output).toContain("Headers:\n  content-type: application/json");
  });
});
