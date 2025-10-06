import { type NormalizedStatus } from "../domain";

export const EXIT_CODE_OK = 0;
export const EXIT_CODE_DEGRADED = 1;
export const EXIT_CODE_DOWN = 2;
export const EXIT_CODE_CONFIG_ERROR = 3;
export const EXIT_CODE_INTERNAL_ERROR = 4;

export function exitCodeFromAggregateStatus(status: NormalizedStatus): number {
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
