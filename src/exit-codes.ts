import { type NormalizedStatus } from "./domain";

export const EXIT_CODE_OK = 0 as const;
export const EXIT_CODE_DEGRADED = 1 as const;
export const EXIT_CODE_DOWN = 2 as const;
export const EXIT_CODE_CONFIG_ERROR = 3 as const;
export const EXIT_CODE_INTERNAL_ERROR = 4 as const;

export type ExitCode =
  | typeof EXIT_CODE_OK
  | typeof EXIT_CODE_DEGRADED
  | typeof EXIT_CODE_DOWN
  | typeof EXIT_CODE_CONFIG_ERROR
  | typeof EXIT_CODE_INTERNAL_ERROR;

export function exitCodeFromAggregateStatus(status: NormalizedStatus): ExitCode {
  switch (status) {
    case "ok":
      return EXIT_CODE_OK;
    case "degraded":
      return EXIT_CODE_DEGRADED;
    case "down":
      return EXIT_CODE_DOWN;
    default: {
      const exhaustiveCheck: never = status;
      return exhaustiveCheck;
    }
  }
}
