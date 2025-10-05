import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

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

describe("httpRequest", () => {
  it("rejects with RequestTimeoutError when the timeout elapses", async () => {
    const server = createServer((_: IncomingMessage, res: ServerResponse) => {
      setTimeout(() => {
        res.statusCode = 200;
        res.end("ok");
      }, 50);
    });

    const port = await listen(server);
    const url = `http://127.0.0.1:${port}/slow`;

    await expect(
      httpRequest({
        url,
        method: "GET",
        timeoutMs: 10,
        env: {},
      }),
    ).rejects.toBeInstanceOf(RequestTimeoutError);

    await close(server);
  });

  it("fulfills successfully when the response arrives before the timeout", async () => {
    const server = createServer((_: IncomingMessage, res: ServerResponse) => {
      res.statusCode = 200;
      res.end("ok");
    });

    const port = await listen(server);
    const url = `http://127.0.0.1:${port}/fast`;

    const response = await httpRequest({
      url,
      method: "GET",
      timeoutMs: 500,
      env: {},
    });

    expect(response.statusCode).toBe(200);
    expect(await response.body.text()).toBe("ok");

    await close(server);
  });

  it("respects an external abort signal", async () => {
    const server = createServer((_: IncomingMessage, res: ServerResponse) => {
      setTimeout(() => {
        res.statusCode = 200;
        res.end("slow");
      }, 100);
    });

    const port = await listen(server);
    const url = `http://127.0.0.1:${port}/abort`;

    const controller = new AbortController();
    const abortReason = new Error("aborted");

    const requestPromise = httpRequest({
      url,
      method: "GET",
      signal: controller.signal,
      env: {},
    });

    setTimeout(() => {
      controller.abort(abortReason);
    }, 10);

    await expect(requestPromise).rejects.toBe(abortReason);

    await close(server);
  });
});
