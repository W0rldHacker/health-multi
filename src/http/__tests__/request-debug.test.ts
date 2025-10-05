import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

import type { HttpDebugLogEntry } from "../debug";
import { RequestTimeoutError, httpRequest } from "../request";

async function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve(address.port);
    });
  });
}

async function close(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

describe("httpRequest debug diagnostics", () => {
  it("produces structured log entry with timings when the response succeeds", async () => {
    const logs: HttpDebugLogEntry[] = [];
    const server = createServer((_: IncomingMessage, res: ServerResponse) => {
      setTimeout(() => {
        res.statusCode = 200;
        res.setHeader("Content-Length", "2");
        res.end("ok");
      }, 25);
    });

    const port = await listen(server);

    const response = await httpRequest({
      url: `http://127.0.0.1:${port}/debug-success`,
      method: "GET",
      env: {},
      debug: {
        id: "req-debug-success",
        logger: (entry) => {
          logs.push(entry);
        },
      },
    });

    expect(response.statusCode).toBe(200);

    const bodyPromise = response.body.text();
    await new Promise((resolve) => setTimeout(resolve, 40));
    await bodyPromise;
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(logs).toHaveLength(1);
    const [entry] = logs;
    expect(entry.id).toBe("req-debug-success");
    expect(entry.url).toContain("/debug-success");
    expect(entry.method).toBe("GET");
    expect(entry.statusCode).toBe(200);
    expect(entry.requestHeaderBytes).toBeGreaterThan(0);
    expect(entry.responseSizeBytes).toBe(2);
    expect(entry.timings.totalMs).toBeGreaterThan(0);
    expect(entry.timings.ttfbMs).toBeGreaterThan(0);

    await close(server);
  });

  it("logs error information when the request times out", async () => {
    const logs: HttpDebugLogEntry[] = [];
    const server = createServer((_: IncomingMessage, res: ServerResponse) => {
      setTimeout(() => {
        res.statusCode = 200;
        res.end("slow");
      }, 1000);
    });

    const port = await listen(server);

    await expect(
      httpRequest({
        url: `http://127.0.0.1:${port}/debug-timeout`,
        method: "GET",
        timeoutMs: 10,
        env: {},
        debug: {
          id: "req-debug-timeout",
          logger: (entry) => {
            logs.push(entry);
          },
        },
      }),
    ).rejects.toBeInstanceOf(RequestTimeoutError);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(logs).toHaveLength(1);
    const [entry] = logs;
    expect(entry.id).toBe("req-debug-timeout");
    expect(entry.error?.name).toBe("RequestTimeoutError");
    expect(typeof entry.error?.message).toBe("string");
    expect(entry.timings.totalMs).toBeGreaterThanOrEqual(0);

    await close(server);
  });
});
