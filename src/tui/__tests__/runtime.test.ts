import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { type ReadStream, type WriteStream } from "node:tty";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { type DashboardState, DashboardRuntime, type ShutdownResult } from "../index";

interface TestStreams {
  input: ReadStream;
  output: WriteStream;
  setRawModeMock: ReturnType<typeof vi.fn>;
  writes: string[];
}

function createStreams(): TestStreams {
  const input = new PassThrough();
  const output = new PassThrough();
  const setRawModeMock = vi.fn();
  const writes: string[] = [];

  output.on("data", (chunk: Buffer) => {
    writes.push(chunk.toString("utf8"));
  });

  Object.assign(input, {
    isTTY: true,
    setRawMode: setRawModeMock,
  });

  Object.assign(output, {
    isTTY: true,
    columns: 80,
    rows: 24,
  });

  return {
    input: input as unknown as ReadStream,
    output: output as unknown as WriteStream,
    setRawModeMock,
    writes,
  };
}

class ProcessStub extends EventEmitter {
  override on(eventName: string | symbol, listener: (...args: unknown[]) => void): this {
    super.on(eventName, listener);
    return this;
  }

  override off(eventName: string | symbol, listener: (...args: unknown[]) => void): this {
    super.off(eventName, listener);
    return this;
  }
}

const baseState: DashboardState = {
  aggregateStatus: "ok",
  serviceCount: 0,
  services: [],
};

describe("DashboardRuntime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("batches rapid updates and debounces renders", async () => {
    const { input, output, setRawModeMock, writes } = createStreams();
    const processStub = new ProcessStub();
    const render = vi
      .fn<(state: DashboardState, width: number) => string>()
      .mockImplementation(
        (state, width) =>
          `width:${width};filters:${state.filters ?? ""};search:${state.searchQuery ?? ""}`,
      );

    const runtime = new DashboardRuntime({
      input,
      output,
      initialState: baseState,
      render,
      process: processStub,
      debounceMs: 200,
    });

    runtime.start();

    expect(render).toHaveBeenCalledTimes(1);
    render.mockClear();

    runtime.update({ filters: "tag:prod" });
    runtime.update({ searchQuery: "api" });

    expect(render).not.toHaveBeenCalled();

    vi.advanceTimersByTime(199);
    expect(render).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(render).toHaveBeenCalledTimes(1);
    const [stateArg, widthArg] = render.mock.calls[0];
    expect(stateArg.filters).toBe("tag:prod");
    expect(stateArg.searchQuery).toBe("api");
    expect(widthArg).toBe(80);

    const shutdownPromise = runtime.waitForShutdown();
    await runtime.shutdown();
    const result = await shutdownPromise;

    expect(result.reason).toBe("programmatic");
    expect(setRawModeMock).toHaveBeenNthCalledWith(1, true);
    expect(setRawModeMock).toHaveBeenNthCalledWith(2, false);
    expect(writes.join("")).toMatch(/width:80/);
  });

  it("pauses polling when the terminal is inactive and resumes later", async () => {
    const { input, output } = createStreams();
    const processStub = new ProcessStub();
    let active = true;
    const onPause = vi.fn();
    const onResume = vi.fn();
    const render = vi
      .fn<(state: DashboardState, width: number) => string>()
      .mockReturnValue("render");

    const runtime = new DashboardRuntime({
      input,
      output,
      initialState: baseState,
      render,
      process: processStub,
      pauseOnInactiveTerminal: true,
      isTerminalActive: () => active,
      onPausePolling: onPause,
      onResumePolling: onResume,
      activityCheckIntervalMs: 250,
      debounceMs: 50,
    });

    runtime.start();
    render.mockClear();

    active = false;
    vi.advanceTimersByTime(250);
    expect(onPause).toHaveBeenCalledTimes(1);

    runtime.update({ filters: "tag:staging" });
    vi.runOnlyPendingTimers();
    expect(render).not.toHaveBeenCalled();

    active = true;
    vi.advanceTimersByTime(250);
    expect(onResume).toHaveBeenCalledTimes(1);

    // Render is scheduled immediately after resuming
    expect(render).toHaveBeenCalledTimes(1);
    expect(render.mock.calls[0][0].filters).toBe("tag:staging");

    await runtime.shutdown();
    await runtime.waitForShutdown();
  });

  it("initiates shutdown when the user presses q", async () => {
    const { input, output, setRawModeMock } = createStreams();
    const processStub = new ProcessStub();
    const drain = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const runtime = new DashboardRuntime({
      input,
      output,
      initialState: baseState,
      render: () => "render",
      process: processStub,
      onDrain: drain,
    });

    runtime.start();

    const shutdownPromise = runtime.waitForShutdown();
    (input as unknown as PassThrough).emit("data", Buffer.from("q"));

    const result: ShutdownResult = await shutdownPromise;
    expect(result.reason).toBe("user-quit");
    expect(drain).toHaveBeenCalledTimes(1);
    expect(setRawModeMock).toHaveBeenNthCalledWith(1, true);
    expect(setRawModeMock).toHaveBeenNthCalledWith(2, false);
  });

  it("handles SIGINT by draining before exit", async () => {
    const { input, output } = createStreams();
    const processStub = new ProcessStub();
    const drain = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const runtime = new DashboardRuntime({
      input,
      output,
      initialState: baseState,
      render: () => "render",
      process: processStub,
      onDrain: drain,
    });

    runtime.start();

    const shutdownPromise = runtime.waitForShutdown();
    processStub.emit("SIGINT");

    const result = await shutdownPromise;
    expect(result.reason).toBe("sigint");
    expect(drain).toHaveBeenCalledTimes(1);
  });
});
