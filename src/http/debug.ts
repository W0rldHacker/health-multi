import diagnosticsChannel from "node:diagnostics_channel";
import type { Socket } from "node:net";
import { performance } from "node:perf_hooks";
import type { Dispatcher } from "undici";

import { redactOptionalUrlCredentials, redactUrlCredentials } from "../redaction";

interface ConnectionState {
  start: number;
  end?: number;
  protocol: string;
  remoteAddress?: string;
  remotePort?: number;
  reused: boolean;
}

interface PendingConnectionState {
  start: number;
  protocol: string;
}

export interface HttpDebugLogEntry {
  id: string;
  url: string;
  method: string;
  attempt: number;
  retries: number;
  backoffMs?: number;
  proxy?: string;
  statusCode?: number;
  error?: { name: string; message: string };
  timings: {
    totalMs: number;
    ttfbMs?: number;
    dnsMs?: number;
    tcpMs?: number;
    tlsMs?: number;
  };
  requestHeaderBytes?: number;
  responseSizeBytes?: number;
  connection?: {
    reused: boolean;
    remoteAddress?: string;
    remotePort?: number;
  };
  startedAt: string;
  completedAt: string;
  outcome: "success" | "error";
}

export interface HttpRequestDebugOptions {
  id?: string;
  attempt?: number;
  retries?: number;
  backoffMs?: number;
  logger?: (entry: HttpDebugLogEntry) => void;
}

const DEFAULT_LOGGER = (entry: HttpDebugLogEntry) => {
  process.stderr.write(`${JSON.stringify(entry)}\n`);
};

const pendingContexts: HttpRequestDebugContext[] = [];
const contextByRequest = new WeakMap<object, HttpRequestDebugContext>();
type ConnectorFn = (...args: unknown[]) => unknown;

const pendingConnections = new WeakMap<ConnectorFn, PendingConnectionState>();
const connectionBySocket = new WeakMap<Socket, ConnectionState>();

let diagnosticsInitialized = false;

function initializeDiagnostics(): void {
  if (diagnosticsInitialized) {
    return;
  }

  diagnosticsInitialized = true;

  diagnosticsChannel.channel("undici:request:create").subscribe((message) => {
    const { request } = message as { request: object };
    const context = pendingContexts.shift();
    if (!context) {
      return;
    }

    context.onRequestCreate(request);
    contextByRequest.set(request, context);
  });

  diagnosticsChannel.channel("undici:client:beforeConnect").subscribe((message) => {
    const { connector, connectParams } = message as {
      connector: ConnectorFn;
      connectParams: { protocol?: string };
    };
    const now = performance.now();
    pendingConnections.set(connector, {
      start: now,
      protocol: connectParams.protocol ?? "http:",
    });
  });

  diagnosticsChannel.channel("undici:client:connected").subscribe((message) => {
    const { connector, socket, connectParams } = message as {
      connector: ConnectorFn;
      socket: Socket;
      connectParams: { protocol?: string };
    };
    const pending = pendingConnections.get(connector);
    const now = performance.now();
    if (pending) {
      pendingConnections.delete(connector);
      connectionBySocket.set(socket, {
        start: pending.start,
        end: now,
        protocol: pending.protocol ?? connectParams.protocol ?? "http:",
        remoteAddress: socket.remoteAddress,
        remotePort: socket.remotePort,
        reused: false,
      });
    } else {
      connectionBySocket.set(socket, {
        start: now,
        end: now,
        protocol: connectParams.protocol ?? "http:",
        remoteAddress: socket.remoteAddress,
        remotePort: socket.remotePort,
        reused: true,
      });
    }
  });

  diagnosticsChannel.channel("undici:client:sendHeaders").subscribe((message) => {
    const { request, headers, socket } = message as {
      request: object;
      headers: string;
      socket: Socket;
    };
    const context = contextByRequest.get(request);
    if (!context) {
      return;
    }

    context.onSendHeaders(headers, socket, connectionBySocket.get(socket));
  });

  diagnosticsChannel.channel("undici:request:headers").subscribe((message) => {
    const { request, response } = message as {
      request: object;
      response: { statusCode: number; headers: Buffer[] };
    };
    const context = contextByRequest.get(request);
    if (!context) {
      return;
    }

    context.onResponseHeaders(response);
  });

  diagnosticsChannel.channel("undici:request:error").subscribe((message) => {
    const { request, error } = message as { request: object; error: unknown };
    const context = contextByRequest.get(request);
    if (!context) {
      return;
    }

    if (error instanceof Error) {
      context.onInstrumentationError(error);
    } else {
      context.onInstrumentationError(new Error(String(error)));
    }
  });
}

function toDate(timestamp: number): Date {
  return new Date(performance.timeOrigin + timestamp);
}

function parseContentLength(headers: Record<string, string>): number | undefined {
  const raw = headers["content-length"];
  if (!raw) {
    return undefined;
  }

  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function decodeHeaders(rawHeaders: Buffer[]): Record<string, string> {
  const result: Record<string, string> = {};

  for (let index = 0; index < rawHeaders.length - 1; index += 2) {
    const name = rawHeaders[index]?.toString().toLowerCase();
    const value = rawHeaders[index + 1]?.toString();
    if (name && value !== undefined) {
      if (result[name] !== undefined) {
        result[name] = `${result[name]}, ${value}`;
      } else {
        result[name] = value;
      }
    }
  }

  return result;
}

export interface CreateHttpRequestDebugContextOptions {
  url: URL;
  method: string;
  attempt: number;
  retries: number;
  backoffMs?: number;
  logger?: (entry: HttpDebugLogEntry) => void;
  id?: string;
}

export interface HttpRequestDebugContext {
  register(): void;
  setProxy(proxy: string | undefined): void;
  onResponse(response: Dispatcher.ResponseData): void;
  onError(error: Error): void;
  finalizeIfNeeded(monotonicNow?: number, outcomeOverride?: "success" | "error"): void;
  onRequestCreate(request: object): void;
  onSendHeaders(rawHeaders: string, socket: Socket, connection: ConnectionState | undefined): void;
  onResponseHeaders(response: { statusCode: number; headers: Buffer[] }): void;
  onInstrumentationError(error: Error): void;
}

export function createHttpRequestDebugContext(
  options: CreateHttpRequestDebugContextOptions,
): HttpRequestDebugContext {
  initializeDiagnostics();
  return new InternalHttpRequestDebugContext(options);
}

class InternalHttpRequestDebugContext implements HttpRequestDebugContext {
  private readonly url: URL;
  private readonly method: string;
  private readonly attempt: number;
  private readonly retries: number;
  private readonly backoffMs?: number;
  private readonly logger: (entry: HttpDebugLogEntry) => void;
  private readonly id: string;
  private readonly start: number;
  private readonly startedAt: Date;
  private proxy?: string;
  private request: object | null = null;
  private statusCode?: number;
  private error?: Error;
  private responseSizeBytes?: number;
  private requestHeaderBytes?: number;
  private connectionState?: ConnectionState;
  private sendHeadersAt?: number;
  private headersReceivedAt?: number;
  private completed = false;
  private cleanupBodyListeners: (() => void) | null = null;

  constructor(options: CreateHttpRequestDebugContextOptions) {
    this.url = options.url;
    this.method = options.method;
    this.attempt = options.attempt;
    this.retries = options.retries;
    this.backoffMs = options.backoffMs;
    this.logger = options.logger ?? DEFAULT_LOGGER;
    this.id = options.id ?? `req-${Math.random().toString(36).slice(2, 10)}`;
    this.start = performance.now();
    this.startedAt = toDate(this.start);
  }

  register(): void {
    pendingContexts.push(this);
  }

  setProxy(proxy: string | undefined): void {
    this.proxy = proxy;
  }

  onRequestCreate(request: object): void {
    this.request = request;
  }

  onSendHeaders(rawHeaders: string, socket: Socket, connection: ConnectionState | undefined): void {
    this.sendHeadersAt = performance.now();
    this.requestHeaderBytes = Buffer.byteLength(rawHeaders, "utf8");
    if (connection) {
      this.connectionState = { ...connection };
    } else {
      this.connectionState = {
        start: performance.now(),
        end: performance.now(),
        protocol: this.url.protocol,
        remoteAddress: socket.remoteAddress,
        remotePort: socket.remotePort,
        reused: true,
      };
    }
  }

  onResponseHeaders(response: { statusCode: number; headers: Buffer[] }): void {
    this.headersReceivedAt = performance.now();
    this.statusCode = response.statusCode;
    const decoded = decodeHeaders(response.headers);
    this.responseSizeBytes = parseContentLength(decoded);
  }

  onResponse(response: Dispatcher.ResponseData): void {
    this.statusCode = response.statusCode;
    const body = response.body as unknown as NodeJS.ReadableStream;

    const finalizeSuccess = () => {
      this.finalizeIfNeeded(performance.now(), "success");
    };
    const finalizeError = (error: unknown) => {
      if (!this.error) {
        this.error = error instanceof Error ? error : new Error(String(error));
      }
      this.finalizeIfNeeded(performance.now(), "error");
    };

    body.once("end", finalizeSuccess);
    body.once("close", finalizeSuccess);
    body.once("error", finalizeError);

    this.cleanupBodyListeners = () => {
      body.off("end", finalizeSuccess);
      body.off("close", finalizeSuccess);
      body.off("error", finalizeError);
    };
  }

  onError(error: Error): void {
    this.error = error;
    this.finalizeIfNeeded(performance.now(), "error");
  }

  onInstrumentationError(error: Error): void {
    if (!this.error) {
      this.error = error;
    }
  }

  finalizeIfNeeded(monotonicNow?: number, outcomeOverride?: "success" | "error"): void {
    if (this.completed) {
      return;
    }

    const now = monotonicNow ?? performance.now();
    const outcome: "success" | "error" = outcomeOverride ?? (this.error ? "error" : "success");
    this.completed = true;
    this.cleanupBodyListeners?.();

    const totalMs = Math.max(0, now - this.start);
    const ttfbMs =
      this.headersReceivedAt && this.sendHeadersAt
        ? Math.max(0, this.headersReceivedAt - this.sendHeadersAt)
        : undefined;

    const connection = this.connectionState;
    const tcpMs =
      connection && connection.end !== undefined
        ? Math.max(0, (connection.end ?? now) - connection.start)
        : undefined;
    const tlsMs =
      connection && connection.protocol.startsWith("https") && connection.end !== undefined
        ? Math.max(0, (connection.end ?? now) - connection.start)
        : undefined;

    const startedAt = this.startedAt;
    const completedAt = toDate(now);

    const entry: HttpDebugLogEntry = {
      id: this.id,
      url: this.url.toString(),
      method: this.method,
      attempt: this.attempt,
      retries: this.retries,
      backoffMs: this.backoffMs,
      proxy: this.proxy,
      statusCode: this.statusCode,
      error: this.error ? { name: this.error.name, message: this.error.message } : undefined,
      timings: {
        totalMs,
        ttfbMs,
        dnsMs: undefined,
        tcpMs,
        tlsMs,
      },
      requestHeaderBytes: this.requestHeaderBytes,
      responseSizeBytes: this.responseSizeBytes,
      connection: connection
        ? {
            reused: connection.reused,
            remoteAddress: connection.remoteAddress,
            remotePort: connection.remotePort,
          }
        : undefined,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      outcome,
    };

    const sanitizedEntry: HttpDebugLogEntry = {
      ...entry,
      url: redactUrlCredentials(entry.url),
      proxy: redactOptionalUrlCredentials(entry.proxy),
    };

    this.logger(sanitizedEntry);

    if (this.request) {
      contextByRequest.delete(this.request);
    }
  }
}
