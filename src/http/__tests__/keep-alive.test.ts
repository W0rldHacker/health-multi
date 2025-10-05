import { describe, expect, it } from "vitest";

import { createKeepAliveAgents } from "../keep-alive";

describe("createKeepAliveAgents", () => {
  it("creates dedicated keep-alive agents for http and https", async () => {
    const defaults = { connections: 16 };
    const httpOverrides = { connectTimeout: 5_000 };
    const httpsOverrides = { keepAliveTimeout: 45_000 };

    const agents = createKeepAliveAgents({
      defaults,
      http: httpOverrides,
      https: httpsOverrides,
    });

    expect(agents.http).not.toBe(agents.https);
    expect(typeof agents.http.dispatch).toBe("function");

    // Verify that options objects were not mutated by the helper.
    expect(defaults).toEqual({ connections: 16 });
    expect(httpOverrides).toEqual({ connectTimeout: 5_000 });
    expect(httpsOverrides).toEqual({ keepAliveTimeout: 45_000 });

    await agents.close();

    expect(agents.http.closed).toBe(true);
    expect(agents.https.closed).toBe(true);
  });
});
