import Ajv, { type ErrorObject } from "ajv";
import ajvErrors from "ajv-errors";
import addFormats from "ajv-formats";
import addKeywords from "ajv-keywords";

import { ConfigValidationError } from "./errors";
import { servicesConfigSchema } from "./schema";
import type { RawServicesFile } from "./types";

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  messages: true,
  coerceTypes: true,
});

addFormats(ajv);
addKeywords(ajv, ["uniqueItemProperties"]);
ajvErrors(ajv, { singleError: false });

const validateFn = ajv.compile<RawServicesFile>(servicesConfigSchema);

function toPointer(instancePath: string): string {
  if (!instancePath) {
    return "config";
  }

  const segments = instancePath
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));

  return segments
    .map((segment) => (Number.isNaN(Number(segment)) ? `.${segment}` : `[${segment}]`))
    .join("")
    .replace(/^\./, "config.");
}

function formatErrors(errors: ErrorObject[]): string {
  return errors
    .map((error) => {
      const pointer = toPointer(error.instancePath);
      const message = error.message ?? "is invalid";
      return `${pointer}: ${message}`;
    })
    .join("\n");
}

export function validateServicesConfig(payload: unknown): asserts payload is RawServicesFile {
  if (!validateFn(payload)) {
    const { errors } = validateFn;
    throw new ConfigValidationError(formatErrors(errors ?? []));
  }
}
