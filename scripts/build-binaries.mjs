#!/usr/bin/env node
/* eslint-env node */
/* global console, process */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, readFile, copyFile, writeFile, readdir } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pkg from "pkg";
import * as tar from "tar";
import { ZipFile } from "yazl";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, "..");
const DIST_DIR = join(ROOT_DIR, "dist");
const RELEASE_DIR = join(DIST_DIR, "release");
const BIN_DIR = join(RELEASE_DIR, "bin");
const STAGING_DIR = join(RELEASE_DIR, "staging");
const ARCHIVE_DIR = join(RELEASE_DIR, "artifacts");
const CHECKSUM_FILE = join(RELEASE_DIR, "SHA256SUMS.txt");

const DOCS_TO_INCLUDE = [
  "README.md",
  "LICENSE",
  "LICENSE-APACHE",
  "LICENSE-MIT",
  "docs/systemd-unit-example.md",
  "docs/release-playbook.ru.md",
];

const TARGETS = [
  { id: "linux-x64", pkgTarget: "node18-linux-x64", binaryName: "health-multi", archive: "tar.gz" },
  {
    id: "darwin-x64",
    pkgTarget: "node18-macos-x64",
    binaryName: "health-multi",
    archive: "tar.gz",
  },
  {
    id: "darwin-arm64",
    pkgTarget: "node18-macos-arm64",
    binaryName: "health-multi",
    archive: "tar.gz",
  },
  { id: "win-x64", pkgTarget: "node18-win-x64", binaryName: "health-multi.exe", archive: "zip" },
];

async function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT_DIR,
      stdio: "inherit",
      ...options,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
      }
    });
  });
}

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function cleanDir(path) {
  await rm(path, { recursive: true, force: true });
  await mkdir(path, { recursive: true });
}

async function buildTypescript() {
  await run("npm", ["run", "--silent", "build:ts"]);
}

async function buildTargetBinary(target) {
  const suffix = target.binaryName.endsWith(".exe") ? ".exe" : "";
  const outputPath = join(BIN_DIR, `health-multi-${target.id}${suffix}`);
  await pkg.exec([join(DIST_DIR, "bin.js"), "--targets", target.pkgTarget, "--output", outputPath]);
  return outputPath;
}

async function copyWithParents(sourcePath, destinationPath) {
  await mkdir(dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);
}

async function stageArtifacts(target, binaryPath) {
  const stageRoot = join(STAGING_DIR, target.id);
  await cleanDir(stageRoot);

  const finalBinaryName = target.binaryName;
  await copyWithParents(binaryPath, join(stageRoot, finalBinaryName));

  for (const relative of DOCS_TO_INCLUDE) {
    const sourcePath = join(ROOT_DIR, relative);
    await copyWithParents(sourcePath, join(stageRoot, relative));
  }

  return stageRoot;
}

async function createTarball(sourceDir, archivePath) {
  const entries = await readdir(sourceDir);
  await tar.create(
    {
      cwd: sourceDir,
      gzip: true,
      portable: true,
      file: archivePath,
    },
    entries,
  );
}

async function addEntriesToZip(zip, directory, base = "") {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    const relativePath = base ? `${base}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      zip.addEmptyDirectory(relativePath);
      await addEntriesToZip(zip, absolutePath, relativePath);
    } else {
      zip.addFile(absolutePath, relativePath);
    }
  }
}

async function createZip(sourceDir, archivePath) {
  const zip = new ZipFile();
  await addEntriesToZip(zip, sourceDir);

  const output = createWriteStream(archivePath);

  await new Promise((resolve, reject) => {
    zip.outputStream.pipe(output);
    zip.outputStream.on("error", reject);
    output.on("error", reject);
    output.on("close", resolve);
    zip.end();
  });
}

async function createArchive(target, stageDir, version) {
  await ensureDir(ARCHIVE_DIR);
  const baseName = `health-multi-v${version}-${target.id}`;
  const archivePath = join(ARCHIVE_DIR, `${baseName}.${target.archive}`);

  if (target.archive === "tar.gz") {
    await createTarball(stageDir, archivePath);
  } else if (target.archive === "zip") {
    await createZip(stageDir, archivePath);
  } else {
    throw new Error(`Unsupported archive format: ${target.archive}`);
  }

  return archivePath;
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function smokeTest(binaryPath) {
  await run(binaryPath, ["--version"], { stdio: "inherit" });
}

async function main() {
  const packageRaw = await readFile(join(ROOT_DIR, "package.json"), "utf8");
  const pkgJson = JSON.parse(packageRaw);
  const version = pkgJson.version;

  await cleanDir(DIST_DIR);
  await buildTypescript();
  await cleanDir(RELEASE_DIR);
  await ensureDir(BIN_DIR);
  await ensureDir(STAGING_DIR);

  const builtArchives = [];
  const builtBinaries = new Map();

  for (const target of TARGETS) {
    const binaryPath = await buildTargetBinary(target);
    const stageDir = await stageArtifacts(target, binaryPath);
    const archivePath = await createArchive(target, stageDir, version);
    builtArchives.push({ target, archivePath });
    builtBinaries.set(target.id, binaryPath);
  }

  const checksumLines = [];
  for (const { target, archivePath } of builtArchives) {
    const hash = await sha256(archivePath);
    const fileName = archivePath.replace(`${ARCHIVE_DIR}/`, "");
    checksumLines.push(`${hash}  ${fileName}`);

    if (target.id === "linux-x64") {
      const binaryPath = builtBinaries.get(target.id);
      if (binaryPath) {
        await smokeTest(binaryPath);
      }
    }
  }

  await writeFile(CHECKSUM_FILE, `${checksumLines.join("\n")}\n`, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
