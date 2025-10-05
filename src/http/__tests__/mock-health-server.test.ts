import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startMockHealthServer, type MockHealthServer } from "../../testing/mock-health-server";
import { httpRequest } from "../request";

describe("mock health server", () => {
  let server: MockHealthServer;

  beforeAll(async () => {
    server = await startMockHealthServer({ slowDelayMs: 120 });
  });

  afterAll(async () => {
    await server.close();
  });

  it("delays responses for /health/slow", async () => {
    const startedAt = Date.now();

    const response = await httpRequest({
      url: server.url("/health/slow"),
      method: "GET",
      timeoutMs: 1_000,
      env: {},
    });

    const elapsed = Date.now() - startedAt;

    expect(response.statusCode).toBe(200);
    expect(elapsed).toBeGreaterThanOrEqual(server.slowDelayMs);
  });

  it("simulates a dropped connection for /health/drop", async () => {
    await expect(
      httpRequest({
        url: server.url("/health/drop"),
        method: "GET",
        timeoutMs: 500,
        env: {},
      }),
    ).rejects.toThrowError();
  });

  it("returns invalid JSON for /health/invalid-json", async () => {
    const response = await httpRequest({
      url: server.url("/health/invalid-json"),
      method: "GET",
      timeoutMs: 500,
      env: {},
    });

    expect(response.statusCode).toBe(200);

    const body = await response.body.text();

    expect(() => {
      JSON.parse(body);
    }).toThrow();
  });

  it("returns HTML content for /health/html", async () => {
    const response = await httpRequest({
      url: server.url("/health/html"),
      method: "GET",
      timeoutMs: 500,
      env: {},
    });

    expect(response.statusCode).toBe(200);
    const headerValue = response.headers["content-type"];
    let normalizedContentType = "";
    if (Array.isArray(headerValue)) {
      normalizedContentType = headerValue.join(", ");
    } else if (typeof headerValue === "string") {
      normalizedContentType = headerValue;
    } else if (headerValue != null) {
      normalizedContentType = String(headerValue);
    }
    expect(normalizedContentType).toMatch(/text\/html/);

    const body = await response.body.text();
    expect(body).toContain("<html>");
  });
});
