import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import { serializeAggregateResultToPrometheusTextfile } from "../prometheus-textfile";
import { createSampleAggregateResult } from "../testing/aggregate-fixtures";
import { ensurePromtool, PromtoolUnavailableError } from "../testing/promtool";

const execFileAsync = promisify(execFile);

describe("prometheus textfile validation via promtool", () => {
  it("passes promtool check metrics", async () => {
    let promtoolPath: string;
    try {
      promtoolPath = await ensurePromtool();
    } catch (error) {
      if (error instanceof PromtoolUnavailableError) {
        console.warn(`Skipping promtool integration test: ${error.message}`);
        return;
      }
      throw error;
    }

    const aggregate = createSampleAggregateResult();
    const metrics = serializeAggregateResultToPrometheusTextfile(aggregate);

    const filePath = join(tmpdir(), `health-multi-${randomUUID()}.prom`);
    await fs.writeFile(filePath, metrics, "utf8");

    try {
      const { stdout, stderr } = await execFileAsync(promtoolPath, ["check", "metrics", filePath]);

      expect(stderr.trim()).toBe("");
      expect(stdout).toContain("SUCCESS");
    } finally {
      await fs.rm(filePath, { force: true });
    }
  }, 60_000);
});
