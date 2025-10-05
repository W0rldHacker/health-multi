import { ProxyAgent, request, type Dispatcher } from "undici";

import {
  createHttpRequestDebugContext,
  type HttpRequestDebugContext,
  type HttpRequestDebugOptions,
} from "./debug";
import type { KeepAliveAgents } from "./keep-alive";

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

type ProxyAgentCache = Map<string, ProxyAgent>;

export interface HttpRequestOptions extends UndiciRequestOptions {
  url: string | URL;
  timeoutMs?: number;
  signal?: AbortSignal;
  keepAliveAgents?: KeepAliveAgents;
  proxy?: string;
  insecure?: boolean;
  env?: NodeJS.ProcessEnv;
  proxyCache?: ProxyAgentCache;
  debug?: HttpRequestDebugOptions;
}

function ensureUrlInstance(value: string | URL): URL {
  if (value instanceof URL) {
    return value;
  }

  return new URL(value);
}

function sanitizeProxyValue(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveProxyFromEnv(protocol: string, env: NodeJS.ProcessEnv): string | undefined {
  const keys = protocol === "https:" ? ["HTTPS_PROXY", "HTTP_PROXY"] : ["HTTP_PROXY"];

  for (const key of keys) {
    const envValue = sanitizeProxyValue(env[key]);
    if (envValue) {
      return envValue;
    }
  }

  return undefined;
}

function resolveProxyUrl(
  url: URL,
  explicitProxy: string | undefined,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const sanitizedExplicit = sanitizeProxyValue(explicitProxy);
  if (sanitizedExplicit) {
    return sanitizedExplicit;
  }

  return resolveProxyFromEnv(url.protocol, env);
}

function getProxyAgent(
  proxyUrl: string,
  insecure: boolean | undefined,
  cache: ProxyAgentCache | undefined,
): ProxyAgent {
  const cacheKey = `${proxyUrl}|rejectUnauthorized=${insecure ? "false" : "true"}`;

  if (cache) {
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const options: ProxyAgent.Options = { uri: proxyUrl };

  if (insecure) {
    options.requestTls = { rejectUnauthorized: false };
  }

  const agent = new ProxyAgent(options);

  if (cache) {
    cache.set(cacheKey, agent);
  }

  return agent;
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
  const {
    url,
    timeoutMs,
    signal,
    keepAliveAgents,
    proxy,
    insecure,
    env,
    proxyCache,
    dispatcher,
    debug,
    ...rest
  } = options;

  const targetUrl = ensureUrlInstance(url);
  const protocol = targetUrl.protocol;

  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error(`Unsupported protocol for request: ${protocol}`);
  }

  const environment = env ?? process.env;

  const hasTimeout = isFinitePositive(timeoutMs);
  const controller = hasTimeout ? new AbortController() : null;
  const timeoutError = hasTimeout ? new RequestTimeoutError(timeoutMs) : null;
  const cleanups: Array<() => void> = [];
  let abortedByInternalTimeout = false;

  const requestDebug: HttpRequestDebugContext | null = debug
    ? createHttpRequestDebugContext({
        url: targetUrl,
        method: rest.method ?? "GET",
        attempt: debug.attempt ?? 1,
        retries: debug.retries ?? 0,
        backoffMs: debug.backoffMs,
        logger: debug.logger,
        id: debug.id,
      })
    : null;

  requestDebug?.register();

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
  const resolvedProxy = resolveProxyUrl(targetUrl, proxy, environment);

  let dispatcherToUse: Dispatcher | undefined = dispatcher;

  requestDebug?.setProxy(resolvedProxy);

  if (!dispatcherToUse) {
    if (resolvedProxy) {
      dispatcherToUse = getProxyAgent(resolvedProxy, insecure, proxyCache);
    } else if (keepAliveAgents) {
      dispatcherToUse = protocol === "https:" ? keepAliveAgents.https : keepAliveAgents.http;
    }
  }

  try {
    const response = await request(url, {
      ...rest,
      ...(dispatcherToUse ? { dispatcher: dispatcherToUse } : {}),
      signal: requestSignal,
    });
    requestDebug?.onResponse(response);
    return response;
  } catch (error) {
    if (controller && controller.signal.aborted) {
      if (abortedByInternalTimeout) {
        requestDebug?.onError(timeoutError ?? new RequestTimeoutError(timeoutMs!));
        throw timeoutError ?? new RequestTimeoutError(timeoutMs!);
      }
      const reason: unknown = controller.signal.reason;
      if (reason instanceof Error) {
        requestDebug?.onError(reason);
        throw reason;
      }
      requestDebug?.onError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
    requestDebug?.onError(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    for (const cleanup of cleanups.splice(0, cleanups.length)) {
      cleanup();
    }
    requestDebug?.finalizeIfNeeded();
  }
}
