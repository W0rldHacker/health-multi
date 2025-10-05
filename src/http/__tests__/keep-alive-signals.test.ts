import { describe, expect, it, vi } from "vitest";

import { createKeepAliveAgents } from "../keep-alive";

describe("createKeepAliveAgents signal handling", () => {
  it("closes agents when SIGINT is received", async () => {
    const agents = createKeepAliveAgents();
    const httpCloseSpy = vi.spyOn(agents.http, "close");
    const httpsCloseSpy = vi.spyOn(agents.https, "close");

    process.emit("SIGINT");

    await vi.waitFor(() => {
      expect(httpCloseSpy).toHaveBeenCalled();
      expect(httpsCloseSpy).toHaveBeenCalled();
    });

    httpCloseSpy.mockRestore();
    httpsCloseSpy.mockRestore();
  });

  it("does not close agents again after they were closed manually", async () => {
    const agents = createKeepAliveAgents();
    const httpCloseSpy = vi.spyOn(agents.http, "close");
    const httpsCloseSpy = vi.spyOn(agents.https, "close");

    await agents.close();

    const httpCallsAfterClose = httpCloseSpy.mock.calls.length;
    const httpsCallsAfterClose = httpsCloseSpy.mock.calls.length;

    process.emit("SIGTERM");

    await new Promise((resolve) => setImmediate(resolve));

    expect(httpCloseSpy.mock.calls.length).toBe(httpCallsAfterClose);
    expect(httpsCloseSpy.mock.calls.length).toBe(httpsCallsAfterClose);

    httpCloseSpy.mockRestore();
    httpsCloseSpy.mockRestore();
  });
});
