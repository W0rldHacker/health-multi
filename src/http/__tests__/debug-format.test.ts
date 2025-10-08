import { describe, expect, it } from "vitest";

import type { HttpDebugLogEntry } from "../debug";
import { formatHttpDebugLogEntry, formatHttpDebugTimeline } from "../debug-format";

function createEntry(partial: Partial<HttpDebugLogEntry> = {}): HttpDebugLogEntry {
  return {
    id: "req-test",
    url: "https://example.com/health",
    method: "GET",
    attempt: 1,
    retries: 0,
    timings: {
      totalMs: 120,
      dnsMs: 5,
      tcpMs: 20,
      tlsMs: 40,
      ttfbMs: 60,
    },
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    outcome: "success",
    ...partial,
  };
}

describe("formatHttpDebugTimeline", () => {
  it("renders a compact bar representation for all phases", () => {
    const entry = createEntry();
    const result = formatHttpDebugTimeline(entry);

    expect(result).toMatch(/dns \[[█·]{14}]\s+5ms/);
    expect(result).toMatch(/tcp \[[█·]{14}]\s+20ms/);
    expect(result).toMatch(/tls \[[█·]{14}]\s+40ms/);
    expect(result).toMatch(/ttfb\[[█·]{14}]\s+60ms/);
    expect(result).toMatch(/total\[█{14}]\s+120ms/);
  });

  it("indicates missing values with placeholder segments", () => {
    const entry = createEntry({
      timings: {
        totalMs: 50,
        ttfbMs: undefined,
        dnsMs: undefined,
        tcpMs: undefined,
        tlsMs: undefined,
      },
    });

    const result = formatHttpDebugTimeline(entry);
    expect(result).toMatch(/dns \[·{14}]\s+--/);
    expect(result).toMatch(/tcp \[·{14}]\s+--/);
    expect(result).toMatch(/tls \[·{14}]\s+--/);
    expect(result).toMatch(/ttfb\[·{14}]\s+--/);
    expect(result).toMatch(/total\[█{14}]\s+50ms/);
  });
});

describe("formatHttpDebugLogEntry", () => {
  it("produces a multi-line summary with the timeline", () => {
    const entry = createEntry({
      statusCode: 200,
      connection: { reused: false, remoteAddress: "127.0.0.1", remotePort: 443 },
    });

    const result = formatHttpDebugLogEntry(entry);
    expect(result).toContain(
      "[req-test] GET https://example.com/health status=200 attempt=1 conn=new@127.0.0.1:443 total=120ms",
    );
    expect(result).toContain("dns [");
  });

  it("includes error metadata when available", () => {
    const entry = createEntry({
      statusCode: undefined,
      outcome: "error",
      error: { name: "RequestTimeoutError", message: "Request timed out" },
    });

    const result = formatHttpDebugLogEntry(entry);
    expect(result).toContain("error=RequestTimeoutError");
  });
});
