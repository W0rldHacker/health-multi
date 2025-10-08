/* eslint-env node */
import { readFile, writeFile } from "node:fs/promises";
import { URL, fileURLToPath } from "node:url";
const benchOutput = new URL("./.dist/benchmarks/storage-bench.js", import.meta.url);

async function patchFile(targetUrl) {
  const filePath = fileURLToPath(targetUrl);
  let source = await readFile(filePath, "utf8");
  source = source.replace(/(["'])\.\.\/src\/([^"']+?)\1/g, (full, quote, specifier) => {
    if (specifier.endsWith(".js")) {
      return full;
    }
    return `${quote}../src/${specifier}.js${quote}`;
  });
  source = source.replace(/(["'])\.\.\/vendor\//g, (full, quote) => `${quote}../../../vendor/`);
  await writeFile(filePath, source, "utf8");
}

await patchFile(benchOutput);
