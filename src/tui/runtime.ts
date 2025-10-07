import { type ReadStream, type WriteStream } from "node:tty";

import type { DashboardState } from "./index";

export type ShutdownReason = "programmatic" | "user-quit" | "sigint";

export interface ShutdownResult {
  reason: ShutdownReason;
  error?: Error;
}

export interface DashboardRuntimeOptions {
  input: ReadStream;
  output: WriteStream;
  initialState: DashboardState;
  render: (state: DashboardState, terminalWidth: number) => string;
  debounceMs?: number;
  getTerminalWidth?: () => number;
  pauseOnInactiveTerminal?: boolean;
  isTerminalActive?: () => boolean;
  onPausePolling?: () => void;
  onResumePolling?: () => void;
  onDrain?: () => Promise<void> | void;
  process?: Pick<NodeJS.EventEmitter, "on" | "off">;
  setTimeoutFn?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void;
  setIntervalFn?: (callback: () => void, delay: number) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (handle: ReturnType<typeof setInterval>) => void;
  activityCheckIntervalMs?: number;
  manageCursor?: boolean;
}

const CLEAR_SCREEN = "\u001B[2J\u001B[H";
const HIDE_CURSOR = "\u001B[?25l";
const SHOW_CURSOR = "\u001B[?25h";

export class DashboardRuntime {
  private readonly input: ReadStream;
  private readonly output: WriteStream;
  private readonly renderFn: (state: DashboardState, terminalWidth: number) => string;
  private readonly debounceMs: number;
  private readonly getTerminalWidth: () => number;
  private readonly pauseOnInactiveTerminal: boolean;
  private readonly isTerminalActiveFn?: () => boolean;
  private readonly onPausePolling?: () => void;
  private readonly onResumePolling?: () => void;
  private readonly onDrain?: () => Promise<void> | void;
  private readonly processRef: Pick<NodeJS.EventEmitter, "on" | "off">;
  private readonly setTimeoutFn: (
    callback: () => void,
    delay: number,
  ) => ReturnType<typeof setTimeout>;
  private readonly clearTimeoutFn: (handle: ReturnType<typeof setTimeout>) => void;
  private readonly setIntervalFn: (
    callback: () => void,
    delay: number,
  ) => ReturnType<typeof setInterval>;
  private readonly clearIntervalFn: (handle: ReturnType<typeof setInterval>) => void;
  private readonly activityCheckIntervalMs: number;
  private readonly manageCursor: boolean;

  private currentState: DashboardState;
  private pendingState: DashboardState | null = null;
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  private activityInterval: ReturnType<typeof setInterval> | null = null;
  private renderScheduled = false;
  private needsRenderOnResume = false;
  private terminalActive = true;
  private pausedPolling = false;
  private running = false;
  private rawModeEnabled = false;
  private lastRenderedOutput: string | null = null;
  private exitInitiated = false;
  private cleanedUp = false;
  private shutdownReason: ShutdownReason = "programmatic";
  private shutdownError: Error | undefined;
  private readonly shutdownPromise: Promise<ShutdownResult>;
  private resolveShutdown!: (result: ShutdownResult) => void;

  constructor(options: DashboardRuntimeOptions) {
    this.input = options.input;
    this.output = options.output;
    this.renderFn = options.render;
    this.currentState = options.initialState;
    this.debounceMs = options.debounceMs ?? 120;
    this.pauseOnInactiveTerminal = Boolean(options.pauseOnInactiveTerminal);
    this.isTerminalActiveFn = options.isTerminalActive;
    this.onPausePolling = options.onPausePolling;
    this.onResumePolling = options.onResumePolling;
    this.onDrain = options.onDrain;
    this.processRef = options.process ?? process;
    this.setTimeoutFn = options.setTimeoutFn ?? ((cb, delay) => setTimeout(cb, delay));
    this.clearTimeoutFn = options.clearTimeoutFn ?? ((handle) => clearTimeout(handle));
    this.setIntervalFn = options.setIntervalFn ?? ((cb, delay) => setInterval(cb, delay));
    this.clearIntervalFn = options.clearIntervalFn ?? ((handle) => clearInterval(handle));
    this.activityCheckIntervalMs = options.activityCheckIntervalMs ?? 1000;
    this.manageCursor =
      options.manageCursor ?? (typeof this.output.isTTY === "boolean" ? this.output.isTTY : false);

    const widthProvider = options.getTerminalWidth ?? (() => this.output.columns ?? 0);
    this.getTerminalWidth = () => {
      const raw = widthProvider();
      if (!Number.isFinite(raw) || raw <= 0) {
        return 80;
      }
      return Math.floor(raw);
    };

    this.shutdownPromise = new Promise<ShutdownResult>((resolve) => {
      this.resolveShutdown = resolve;
    });
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;

    if (this.manageCursor) {
      this.output.write(HIDE_CURSOR);
    }

    if (this.input.isTTY && typeof this.input.setRawMode === "function") {
      this.input.setRawMode(true);
      this.rawModeEnabled = true;
    }

    if (typeof this.input.resume === "function") {
      this.input.resume();
    }

    this.input.on("data", this.handleInputData);
    this.output.on("resize", this.handleResize);
    this.processRef.on("SIGINT", this.handleSigint);

    this.refreshActivity(true);
    this.flushPendingState();
    this.performRender();

    if (this.pauseOnInactiveTerminal && this.isTerminalActiveFn) {
      this.activityInterval = this.setIntervalFn(
        () => this.refreshActivity(false),
        this.activityCheckIntervalMs,
      );
    }
  }

  update(patch: Partial<DashboardState>): void {
    const baseState = this.pendingState ?? this.currentState;
    this.pendingState = { ...baseState, ...patch };

    if (!this.running) {
      return;
    }

    this.scheduleRender();
  }

  setState(state: DashboardState): void {
    this.pendingState = state;

    if (!this.running) {
      return;
    }

    this.scheduleRender();
  }

  waitForShutdown(): Promise<ShutdownResult> {
    return this.shutdownPromise;
  }

  async shutdown(reason: ShutdownReason = "programmatic"): Promise<ShutdownResult> {
    if (this.exitInitiated) {
      return this.shutdownPromise;
    }

    this.exitInitiated = true;
    this.shutdownReason = reason;

    this.cleanup();

    if (this.onDrain) {
      try {
        await this.onDrain();
      } catch (error) {
        this.shutdownError = error instanceof Error ? error : new Error(String(error));
      }
    }

    this.resolveShutdown(
      this.shutdownError
        ? { reason: this.shutdownReason, error: this.shutdownError }
        : { reason: this.shutdownReason },
    );

    return this.shutdownPromise;
  }

  private scheduleRender(delay?: number): void {
    if (!this.running) {
      return;
    }

    if (this.pauseOnInactiveTerminal && !this.terminalActive) {
      this.needsRenderOnResume = true;
      return;
    }

    if (typeof delay === "number" && delay <= 0) {
      if (this.renderTimer) {
        this.clearTimeoutFn(this.renderTimer);
        this.renderTimer = null;
      }
      this.renderScheduled = false;
      this.flushPendingState();
      this.performRender();
      return;
    }

    if (this.renderScheduled) {
      return;
    }

    this.renderScheduled = true;
    const effectiveDelay = typeof delay === "number" ? delay : this.debounceMs;
    this.renderTimer = this.setTimeoutFn(() => {
      this.renderScheduled = false;
      this.renderTimer = null;
      this.flushPendingState();
      this.performRender();
    }, effectiveDelay);
  }

  private flushPendingState(): void {
    if (!this.pendingState) {
      return;
    }

    this.currentState = this.pendingState;
    this.pendingState = null;
  }

  private performRender(): void {
    if (this.pauseOnInactiveTerminal && !this.terminalActive) {
      this.needsRenderOnResume = true;
      return;
    }

    const width = this.getTerminalWidth();
    const output = this.renderFn(this.currentState, width);

    if (this.lastRenderedOutput === output) {
      return;
    }

    this.lastRenderedOutput = output;
    this.output.write(`${CLEAR_SCREEN}${output}`);
  }

  private readonly handleInputData = (chunk: Buffer): void => {
    for (const code of chunk) {
      if (code === 0x03) {
        this.handleSigint();
        return;
      }

      if (code === 0x71 || code === 0x51) {
        void this.shutdown("user-quit");
        return;
      }
    }
  };

  private readonly handleResize = (): void => {
    if (!this.running) {
      return;
    }

    if (this.pauseOnInactiveTerminal && !this.terminalActive) {
      this.needsRenderOnResume = true;
      return;
    }

    this.scheduleRender(0);
  };

  private readonly handleSigint = (): void => {
    void this.shutdown("sigint");
  };

  private refreshActivity(forceEmit: boolean): void {
    const active = this.isTerminalActiveFn ? this.isTerminalActiveFn() : true;

    if (!forceEmit && active === this.terminalActive) {
      return;
    }

    this.terminalActive = active;

    if (!this.pauseOnInactiveTerminal) {
      return;
    }

    if (!active) {
      if (!this.pausedPolling) {
        this.pausedPolling = true;
        this.onPausePolling?.();
      }
      this.needsRenderOnResume = true;
      return;
    }

    if (this.pausedPolling) {
      this.pausedPolling = false;
      this.onResumePolling?.();
    }

    if (this.needsRenderOnResume) {
      this.needsRenderOnResume = false;
      this.scheduleRender(0);
    }
  }

  private cleanup(): void {
    if (this.cleanedUp) {
      return;
    }

    this.cleanedUp = true;
    this.running = false;

    if (this.renderTimer) {
      this.clearTimeoutFn(this.renderTimer);
      this.renderTimer = null;
    }

    if (this.activityInterval) {
      this.clearIntervalFn(this.activityInterval);
      this.activityInterval = null;
    }

    this.renderScheduled = false;
    this.needsRenderOnResume = false;

    this.input.off("data", this.handleInputData);
    if (typeof this.input.pause === "function") {
      this.input.pause();
    }

    if (this.rawModeEnabled && this.input.isTTY && typeof this.input.setRawMode === "function") {
      this.input.setRawMode(false);
      this.rawModeEnabled = false;
    }

    this.output.off("resize", this.handleResize);
    this.processRef.off("SIGINT", this.handleSigint);

    if (this.manageCursor) {
      this.output.write(SHOW_CURSOR);
    }
  }
}
