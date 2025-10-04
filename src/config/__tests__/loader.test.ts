import { describe, expect, it } from "vitest";

import {
  ConfigValidationError,
  MissingEnvironmentVariableError,
  parseServicesConfig,
} from "../../config";

const baseConfig = `
services:
  - name: api
    url: https://api.example.com/health
`;

describe("parseServicesConfig", () => {
  it("parses valid configuration and resolves environment placeholders", () => {
    const config = parseServicesConfig(
      `
interval: 15s
timeout: 3s
retries: 1
concurrency: 5
default_headers:
  Authorization: "Bearer \${HEALTH_TOKEN}"
services:
  - name: api
    url: https://api.example.com/health
    tags: [prod, eu]
    headers:
      X-Token: "\${CUSTOM_HEADER}"
`,
      {
        env: {
          HEALTH_TOKEN: "secrettoken",
          CUSTOM_HEADER: "abcdef",
        },
      },
    );

    expect(config.interval).toBe("15s");
    expect(config.default_headers?.Authorization).toBe("Bearer secrettoken");
    expect(config.services[0]?.headers?.["X-Token"]).toBe("abcdef");
  });

  it("throws validation error when service names are duplicated", () => {
    expect(() =>
      parseServicesConfig(
        `
services:
  - name: api
    url: https://api.example.com/health
  - name: api
    url: https://other.example.com/health
`,
      ),
    ).toThrowError(ConfigValidationError);
  });

  it("throws validation error for invalid service URL", () => {
    expect(() =>
      parseServicesConfig(
        `
services:
  - name: api
    url: not-a-url
`,
      ),
    ).toThrowError(/Service URL must be a valid URI/);
  });

  it("validates duration strings", () => {
    expect(() =>
      parseServicesConfig(
        `
timeout: 10seconds
${baseConfig}
`,
      ),
    ).toThrowError(/Timeout must be expressed as a duration/);
  });

  it("fails when referenced environment variables are missing", () => {
    expect(() =>
      parseServicesConfig(
        `
default_headers:
  Authorization: "Bearer \${MISSING_TOKEN}"
${baseConfig}
`,
      ),
    ).toThrowError(MissingEnvironmentVariableError);
  });
});
