import { Text } from "ink";
import { render } from "ink-testing-library";
import React from "react";
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

  function renderFrame(state: DashboardState, width: number): string {
    const instance: ReturnType<typeof render> = render(
      React.createElement(Text, null, renderDashboard(state, width)),
    );
    const frame = instance.lastFrame();
    instance.unmount();
    return typeof frame === "string" ? frame : "";
  }

  it("matches snapshot for the service table", () => {
    const frame = renderFrame(
      {
        ...baseState,
        filters: "tag:prod",
        searchQuery: "api",
        sort: { by: "latency", direction: "asc" },
      },
      100,
    );

    expect(frame).toMatchInlineSnapshot(`
      "Aggregate: OK | Services: 2 | Last tick: 2024-01-01T12:00:00.000Z
      Filters: tag:prod | Search: "api" | Sort: latency ↑ | Matches: 1/2
      Keys: [f]ilter  [/] search  [s] sort  [q] quit
      Name                   │ Status   │  Latency │ Version  │ Region   │    Age │ Tags
      ───────────────────────┼──────────┼──────────┼──────────┼──────────┼────────┼───────────────────────
      api                    │ OK       │   123 ms │ 1.2.3    │ eu-cent… │    15s │ prod, eu"
    `);
  });

  it("matches snapshot for a narrow terminal width", () => {
    const frame = renderFrame(baseState, 60);

    expect(frame).toMatchInlineSnapshot(`
      "Aggregate: OK | Services: 2 | Last tick: 2024-01-01T12:00:00.000Z
      Filters: none | Search: — | Sort: name ↑ | Matches: 2/2
      Keys: [f]ilter  [/] search  [s] sort  [q] quit
      Na… │ Status   │  Latency │ Version  │ Region │    Age │ Ta…
      ────┼──────────┼──────────┼──────────┼────────┼────────┼────
      api │ OK       │   123 ms │ 1.2.3    │ eu-ce… │    15s │ pr…
      au… │ DEGRADED │   988 ms │ 2.0.0    │ us-ea… │     1m │ st…"
    `);
  });

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

  it("matches snapshot for the service detail pane", () => {
    const detailPane: ServiceDetailPane = {
      service: services[0],
      latencyHistoryMs: [10, 20, 40, 80],
      responseJson: { status: "ok", version: "1.2.3" },
      responseHeaders: { "content-type": "application/json" },
      historyWindow: 4,
      capturedAt: new Date("2024-01-01T12:00:00.000Z"),
    };

    const frame = renderFrame(
      {
        ...baseState,
        detailPane,
      },
      100,
    );

    expect(frame).toMatchInlineSnapshot(`
      "Aggregate: OK | Services: 2 | Last tick: 2024-01-01T12:00:00.000Z
      Filters: none | Search: — | Sort: name ↑ | Matches: 2/2
      Keys: [f]ilter  [/] search  [s] sort  [q] quit
      Name                   │ Status   │  Latency │ Version  │ Region   │    Age │ Tags
      ───────────────────────┼──────────┼──────────┼──────────┼──────────┼────────┼───────────────────────
      api                    │ OK       │   123 ms │ 1.2.3    │ eu-cent… │    15s │ prod, eu
      auth                   │ DEGRADED │   988 ms │ 2.0.0    │ us-east… │     1m │ stage
      ────────────────────────────────────────────────────────────────────────────────────────────────────
      Detail: api
      Status: OK
      Latency: 123 ms
      URL: https://api.example.com/health
      Region: eu-central-1
      Tags: prod, eu
      Latency sparkline (last 4): ▁▂▄█
      Captured at: 2024-01-01T12:00:00.000Z
      Last response JSON:
        {
          "status": "ok",
          "version": "1.2.3"
        }
      Headers:
        content-type: application/json"
    `);
  });

  it("redacts credentials embedded in service URLs", () => {
    const frame = renderFrame(
      {
        ...baseState,
        detailPane: {
          service: { name: "api" },
          url: "https://user:secret@example.com/health",
        },
      },
      100,
    );

    expect(frame).toContain("URL: https://user:[redacted]@example.com/health");
  });
});
