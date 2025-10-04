import type { NormalizedStatus } from "../domain";

export type DurationString = string;

export interface RawServiceConfig {
  name: string;
  url: string;
  expect_status?: NormalizedStatus;
  tags?: string[];
  headers?: Record<string, string>;
  proxy?: string;
  timeout?: DurationString;
}

export interface RawServicesFile {
  interval?: DurationString;
  timeout?: DurationString;
  retries?: number;
  concurrency?: number;
  default_headers?: Record<string, string>;
  headers?: Record<string, string>;
  proxy?: string;
  insecure?: boolean;
  services: RawServiceConfig[];
}
