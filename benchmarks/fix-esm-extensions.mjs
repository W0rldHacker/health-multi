/* eslint-env node */
import { readFile, writeFile } from "node:fs/promises";
import { URL, fileURLToPath } from "node:url";
const distRoot = new URL("./.dist/", import.meta.url);
const distDir = new URL("./benchmarks/", distRoot);
const distPackageJson = new URL("./package.json", distDir);
const distRootPackageJson = new URL("./package.json", distRoot);

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

const targets = ["storage-bench.js", "storage-soak.js"];

await Promise.all(
  targets.map(async (fileName) => {
    const targetUrl = new URL(fileName, distDir);
    try {
      await patchFile(targetUrl);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return;
      }
      throw error;
    }
  }),
);

const packageJsonContents = `${JSON.stringify({ type: "module" }, null, 2)}\n`;
await Promise.all([
  writeFile(distPackageJson, packageJsonContents, "utf8"),
  writeFile(distRootPackageJson, packageJsonContents, "utf8"),
]);
