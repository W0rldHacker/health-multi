import { request, type Dispatcher } from "undici";

export class RequestTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = "RequestTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

type UndiciRequestOptions = {
  dispatcher?: Dispatcher;
} & Omit<Dispatcher.RequestOptions, "origin" | "path" | "method" | "signal"> &
  Partial<Pick<Dispatcher.RequestOptions, "method">>;

export interface HttpRequestOptions extends UndiciRequestOptions {
  url: string | URL;
  timeoutMs?: number;
  signal?: AbortSignal;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function forwardAbortSignal(source: AbortSignal, controller: AbortController): () => void {
  if (source.aborted) {
    controller.abort(source.reason);
    return () => {};
  }

  const listener = () => {
    controller.abort(source.reason);
  };

  source.addEventListener("abort", listener, { once: true });

  return () => {
    source.removeEventListener("abort", listener);
  };
}

export async function httpRequest(options: HttpRequestOptions): Promise<Dispatcher.ResponseData> {
  const { url, timeoutMs, signal, ...rest } = options;

  const hasTimeout = isFinitePositive(timeoutMs);
  const controller = hasTimeout ? new AbortController() : null;
  const timeoutError = hasTimeout ? new RequestTimeoutError(timeoutMs) : null;
  const cleanups: Array<() => void> = [];
  let abortedByInternalTimeout = false;

  if (controller) {
    if (typeof timeoutMs === "number") {
      const timer = setTimeout(() => {
        if (!controller.signal.aborted) {
          abortedByInternalTimeout = true;
          controller.abort(timeoutError ?? new RequestTimeoutError(timeoutMs));
        }
      }, timeoutMs);
      cleanups.push(() => {
        clearTimeout(timer);
      });
    }

    if (signal) {
      cleanups.push(forwardAbortSignal(signal, controller));
    }
  }

  const requestSignal = controller ? controller.signal : signal;

  try {
    return await request(url, {
      ...rest,
      signal: requestSignal,
    });
  } catch (error) {
    if (controller && controller.signal.aborted) {
      if (abortedByInternalTimeout) {
        throw timeoutError ?? new RequestTimeoutError(timeoutMs!);
      }
      const reason: unknown = controller.signal.reason;
      if (reason instanceof Error) {
        throw reason;
      }
      throw error;
    }
    throw error;
  } finally {
    for (const cleanup of cleanups.splice(0, cleanups.length)) {
      cleanup();
    }
  }
}
