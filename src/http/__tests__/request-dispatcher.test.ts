import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("httpRequest dispatcher selection", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("undici");
    vi.resetModules();
  });

  async function setupHttpRequest() {
    const requestSpy = vi.fn().mockResolvedValue({
      statusCode: 200,
      body: {
        text: () => Promise.resolve(""),
      },
    });
    const proxyAgents: Array<{ options: unknown }> = [];

    class MockProxyAgent {
      readonly options: unknown;

      constructor(options: unknown) {
        this.options = options;
        proxyAgents.push(this);
      }

      dispatch(): boolean {
        return true;
      }

      close(): Promise<void> {
        return Promise.resolve();
      }
    }

    vi.doMock("undici", () => ({
      request: requestSpy,
      ProxyAgent: MockProxyAgent,
    }));

    const module = await import("../request");

    return {
      httpRequest: module.httpRequest,
      requestSpy,
      proxyAgents,
    };
  }

  it("uses a proxy agent when an explicit proxy is provided", async () => {
    const { httpRequest, requestSpy, proxyAgents } = await setupHttpRequest();

    await httpRequest({
      url: "http://service.test/health",
      method: "GET",
      proxy: "http://proxy.local",
      env: {},
    });

    expect(proxyAgents).toHaveLength(1);
    expect((proxyAgents[0].options as { uri: string }).uri).toBe("http://proxy.local");
    expect(requestSpy).toHaveBeenCalledWith(
      "http://service.test/health",
      expect.objectContaining({ dispatcher: proxyAgents[0] }),
    );
  });

  it("falls back to HTTPS proxy from the environment", async () => {
    const { httpRequest, proxyAgents } = await setupHttpRequest();

    await httpRequest({
      url: "https://service.test/health",
      method: "GET",
      env: { HTTPS_PROXY: "http://proxy.from.env" },
    });

    expect(proxyAgents).toHaveLength(1);
    expect((proxyAgents[0].options as { uri: string }).uri).toBe("http://proxy.from.env");
  });

  it("uses HTTP proxy from the environment for http URLs", async () => {
    const { httpRequest, proxyAgents } = await setupHttpRequest();

    await httpRequest({
      url: "http://service.test/health",
      method: "GET",
      env: { HTTP_PROXY: "http://env-proxy" },
    });

    expect(proxyAgents).toHaveLength(1);
    expect((proxyAgents[0].options as { uri: string }).uri).toBe("http://env-proxy");
  });

  it("reuses keep-alive agents when no proxy is configured", async () => {
    const { httpRequest, requestSpy } = await setupHttpRequest();
    const httpAgent = { id: "http" } as never;
    const httpsAgent = { id: "https" } as never;

    await httpRequest({
      url: "http://service.test/health",
      method: "GET",
      keepAliveAgents: {
        http: httpAgent,
        https: httpsAgent,
        close: async () => {},
        destroy: async () => {},
      },
      env: {},
    });

    expect(requestSpy).toHaveBeenCalledWith(
      "http://service.test/health",
      expect.objectContaining({ dispatcher: httpAgent }),
    );

    await httpRequest({
      url: "https://service.test/health",
      method: "GET",
      keepAliveAgents: {
        http: httpAgent,
        https: httpsAgent,
        close: async () => {},
        destroy: async () => {},
      },
      env: {},
    });

    expect(requestSpy).toHaveBeenLastCalledWith(
      "https://service.test/health",
      expect.objectContaining({ dispatcher: httpsAgent }),
    );
  });

  it("reuses proxy agents via the provided cache", async () => {
    const { httpRequest, proxyAgents } = await setupHttpRequest();
    const proxyCache = new Map();

    await httpRequest({
      url: "http://service.test/health",
      method: "GET",
      proxy: "http://proxy.local",
      proxyCache,
      env: {},
    });

    await httpRequest({
      url: "http://service.test/other",
      method: "GET",
      proxy: "http://proxy.local",
      proxyCache,
      env: {},
    });

    expect(proxyAgents).toHaveLength(1);
  });

  it("disables TLS verification for proxy requests when insecure is true", async () => {
    const { httpRequest, proxyAgents } = await setupHttpRequest();

    await httpRequest({
      url: "https://service.test/health",
      method: "GET",
      proxy: "http://proxy.local",
      insecure: true,
      env: {},
    });

    expect(proxyAgents).toHaveLength(1);
    expect(
      (proxyAgents[0].options as { requestTls?: { rejectUnauthorized?: boolean } }).requestTls,
    ).toEqual({
      rejectUnauthorized: false,
    });
  });
});
