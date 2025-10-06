import { createServer, type HttpServer, type ResponseObject } from "@worldhacker/starpath";
import { setTimeout as delay } from "node:timers/promises";

export interface MockHealthServerOptions {
  /**
   * Delay in milliseconds applied by the `/health/slow` endpoint before
   * responding. Defaults to 150ms.
   */
  slowDelayMs?: number;
}

export interface MockHealthServer {
  readonly host: string;
  readonly port: number;
  readonly baseUrl: string;
  readonly slowDelayMs: number;
  /**
   * Constructs an absolute URL using the server's base URL.
   */
  url(pathname?: string): string;
  /**
   * Gracefully shuts down the underlying HTTP server.
   */
  close(): Promise<void>;
}

function jsonResponse(body: unknown): ResponseObject {
  const json = JSON.stringify(body);
  return {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-length": String(Buffer.byteLength(json)),
    },
    body: json,
  };
}

export async function startMockHealthServer(
  options: MockHealthServerOptions = {},
): Promise<MockHealthServer> {
  const slowDelayMs = options.slowDelayMs ?? 150;
  const host = "127.0.0.1";

  const server: HttpServer = createServer();

  server.route("GET", "/health/ok", async (ctx) => {
    await ctx.respond(
      jsonResponse({
        status: "ok",
        timings: { total_ms: 12 },
        version: "1.0.0",
      }),
    );
  });

  server.route("GET", "/health/slow", async (ctx) => {
    await delay(slowDelayMs);
    await ctx.respond(
      jsonResponse({
        status: "ok",
        timings: { total_ms: slowDelayMs },
      }),
    );
  });

  server.route("GET", "/health/missing-status", async (ctx) => {
    await ctx.respond(
      jsonResponse({
        timings: { total_ms: 34 },
        version: "2.0.0",
      }),
    );
  });

  server.route("GET", "/health/drop", (ctx) => {
    ctx.res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
    });
    ctx.res.write('{"status":"ok"');
    // Intentionally terminate the socket to simulate a dropped connection.
    ctx.res.destroy();
  });

  server.route("GET", "/health/invalid-json", async (ctx) => {
    await ctx.respond({
      status: 200,
      headers: {
        "content-type": "application/json",
      },
      body: "{ invalid-json",
    });
  });

  server.route("GET", "/health/html", async (ctx) => {
    await ctx.respond({
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
      body: "<html><body>not json</body></html>",
    });
  });

  let assignedPort = 0;

  await server.listen({
    host,
    onListen({ port }) {
      assignedPort = port;
    },
  });

  if (assignedPort === 0) {
    throw new Error("Failed to determine port for mock health server");
  }

  const baseUrl = `http://${host}:${assignedPort}`;

  return {
    host,
    port: assignedPort,
    baseUrl,
    slowDelayMs,
    url(pathname = "/") {
      return new URL(pathname, baseUrl).toString();
    },
    async close() {
      await server.close();
    },
  };
}
