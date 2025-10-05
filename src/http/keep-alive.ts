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

export function createKeepAliveAgents(options: KeepAliveAgentOptions = {}): KeepAliveAgents {
  const http = new Agent(mergeOptions(options.defaults, options.http));
  const https = new Agent(mergeOptions(options.defaults, options.https));

  return {
    http,
    https,
    close: async () => {
      await Promise.all([http.close(), https.close()]);
    },
    destroy: async (err?: Error) => {
      const reason = err ?? null;
      await Promise.all([http.destroy(reason), https.destroy(reason)]);
    },
  };
}
