import { Agent } from "undici";

export interface KeepAliveAgents {
  http: Agent;
  https: Agent;
  close(): Promise<void>;
  destroy(err?: Error): Promise<void>;
}

export interface KeepAliveAgentOptions {
  defaults?: Agent.Options;
  http?: Agent.Options;
  https?: Agent.Options;
  insecure?: boolean;
}

const DEFAULT_AGENT_OPTIONS: Agent.Options = {
  connections: 128,
  connectTimeout: 10_000,
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 600_000,
  keepAliveTimeoutThreshold: 1_000,
};

function mergeOptions(
  defaults: Agent.Options | undefined,
  overrides: Agent.Options | undefined,
): Agent.Options {
  return {
    ...DEFAULT_AGENT_OPTIONS,
    ...defaults,
    ...overrides,
  };
}

function applyInsecureTlsOverrides(
  options: Agent.Options,
  insecure: boolean | undefined,
): Agent.Options {
  if (!insecure) {
    return options;
  }

  const connectOption = options.connect;

  if (typeof connectOption === "function") {
    return {
      ...options,
      connect: connectOption,
    };
  }

  const existingConnectOptions =
    typeof connectOption === "object" && connectOption !== null ? connectOption : {};

  return {
    ...options,
    connect: {
      ...existingConnectOptions,
      rejectUnauthorized: false,
    },
  };
}

export function createKeepAliveAgents(options: KeepAliveAgentOptions = {}): KeepAliveAgents {
  const http = new Agent(mergeOptions(options.defaults, options.http));
  const httpsOptions = applyInsecureTlsOverrides(
    mergeOptions(options.defaults, options.https),
    options.insecure,
  );
  const https = new Agent(httpsOptions);

  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  const signalListeners = new Map<NodeJS.Signals, () => void>();

  let closePromise: Promise<void> | null = null;
  let destroyPromise: Promise<void> | null = null;

  const cleanupSignalListeners = () => {
    for (const [signal, listener] of signalListeners) {
      process.removeListener(signal, listener);
    }
    signalListeners.clear();
  };

  const closeAgents = async () => {
    if (closePromise) {
      return closePromise;
    }

    if (destroyPromise) {
      return destroyPromise;
    }

    cleanupSignalListeners();
    closePromise = Promise.all([http.close(), https.close()]).then(() => {});
    return closePromise;
  };

  const destroyAgents = async (err?: Error) => {
    if (destroyPromise) {
      return destroyPromise;
    }

    cleanupSignalListeners();
    const reason = err ?? null;
    destroyPromise = Promise.all([http.destroy(reason), https.destroy(reason)]).then(() => {});
    return destroyPromise;
  };

  for (const signal of signals) {
    const listener = () => {
      void closeAgents().catch(async (error) => {
        const reason = error instanceof Error ? error : new Error(String(error));
        await destroyAgents(reason);
      });
    };
    signalListeners.set(signal, listener);
    process.once(signal, listener);
  }

  return {
    http,
    https,
    close: closeAgents,
    destroy: destroyAgents,
  };
}
