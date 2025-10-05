import { describe, expect, it, vi } from "vitest";

describe("createKeepAliveAgents insecure option", () => {
  it("configures HTTPS agent to skip TLS verification when insecure is true", async () => {
    vi.resetModules();

    class MockAgent {
      readonly options: unknown;
      closed = false;
      destroyed = false;

      constructor(options: unknown = {}) {
        this.options = options;
      }

      close(): Promise<void> {
        this.closed = true;
        return Promise.resolve();
      }

      destroy(): Promise<void> {
        this.destroyed = true;
        return Promise.resolve();
      }

      dispatch(): boolean {
        return true;
      }
    }

    vi.doMock("undici", () => ({
      Agent: MockAgent,
    }));

    const { createKeepAliveAgents } = await import("../keep-alive");

    const agents = createKeepAliveAgents({ insecure: true });

    const httpsAgent = agents.https as unknown as {
      options: { connect?: { rejectUnauthorized?: boolean } };
    };

    expect(httpsAgent.options.connect?.rejectUnauthorized).toBe(false);

    await agents.close();

    vi.doUnmock("undici");
  });
});
