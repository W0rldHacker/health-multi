import type { Schema } from "ajv";

import { durationPatternSource } from "../duration";

export const DURATION_PATTERN = durationPatternSource;

export const servicesConfigSchema = {
  $id: "https://health-multi.dev/schemas/services-config.json",
  type: "object",
  additionalProperties: false,
  required: ["services"],
  properties: {
    interval: {
      type: "string",
      pattern: DURATION_PATTERN,
      errorMessage: {
        pattern: "Interval must be expressed as a duration like 500ms, 3s or 1m",
      },
    },
    timeout: {
      type: "string",
      pattern: DURATION_PATTERN,
      errorMessage: {
        pattern: "Timeout must be expressed as a duration like 500ms, 3s or 1m",
      },
    },
    retries: {
      type: "integer",
      minimum: 0,
      errorMessage: {
        type: "Retries must be an integer",
        minimum: "Retries cannot be negative",
      },
    },
    concurrency: {
      type: "integer",
      minimum: 0,
      errorMessage: {
        type: "Concurrency must be an integer",
        minimum: "Concurrency cannot be negative",
      },
    },
    default_headers: {
      type: "object",
      propertyNames: {
        type: "string",
        minLength: 1,
        errorMessage: {
          minLength: "Header names must not be empty",
        },
      },
      additionalProperties: {
        type: "string",
        errorMessage: {
          type: "Header values must be strings",
        },
      },
    },
    headers: {
      type: "object",
      propertyNames: {
        type: "string",
        minLength: 1,
        errorMessage: {
          minLength: "Header names must not be empty",
        },
      },
      additionalProperties: {
        type: "string",
        errorMessage: {
          type: "Header values must be strings",
        },
      },
    },
    proxy: {
      type: "string",
      format: "uri",
      errorMessage: {
        format: "Proxy must be a valid URI",
      },
    },
    insecure: {
      type: "boolean",
    },
    services: {
      type: "array",
      minItems: 1,
      uniqueItemProperties: ["name"],
      errorMessage: {
        minItems: "At least one service must be specified",
        uniqueItemProperties: "Service names must be unique",
      },
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "url"],
        properties: {
          name: {
            type: "string",
            minLength: 1,
            errorMessage: {
              minLength: "Service name must not be empty",
            },
          },
          url: {
            type: "string",
            format: "uri",
            errorMessage: {
              format: "Service URL must be a valid URI",
            },
          },
          expect_status: {
            type: "string",
            enum: ["ok", "degraded", "down"],
            errorMessage: {
              enum: "expect_status must be one of: ok, degraded, down",
            },
          },
          tags: {
            type: "array",
            items: {
              type: "string",
              minLength: 1,
              errorMessage: {
                minLength: "Tags must not be empty",
              },
            },
            uniqueItems: true,
            errorMessage: {
              uniqueItems: "Tags must be unique",
            },
          },
          headers: {
            type: "object",
            propertyNames: {
              type: "string",
              minLength: 1,
              errorMessage: {
                minLength: "Header names must not be empty",
              },
            },
            additionalProperties: {
              type: "string",
              errorMessage: {
                type: "Header values must be strings",
              },
            },
          },
          proxy: {
            type: "string",
            format: "uri",
            errorMessage: {
              format: "Proxy must be a valid URI",
            },
          },
          timeout: {
            type: "string",
            pattern: DURATION_PATTERN,
            errorMessage: {
              pattern: "Timeout must be expressed as a duration like 500ms, 3s or 1m",
            },
          },
        },
        errorMessage: {
          required: {
            name: "Each service must define a name",
            url: "Each service must define a URL",
          },
        },
      },
    },
  },
  errorMessage: {
    required: {
      services: "The services array is required",
    },
  },
} as const satisfies Schema & { errorMessage?: unknown };
