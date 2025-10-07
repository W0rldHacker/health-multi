import { createWriteStream } from "node:fs";
import { access, chmod, mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises";
import https from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import tar from "tar";

export class PromtoolUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PromtoolUnavailableError";
  }
}

type TarModule = {
  x(options: { file: string; cwd: string }): Promise<void>;
};

const tarModule = tar as unknown as TarModule;

const PROMTOOL_VERSION = process.env.PROMTOOL_VERSION ?? "2.53.0";
const PROMTOOL_PATH_OVERRIDE = process.env.PROMTOOL_PATH;

interface ArchiveInfo {
  readonly suffix: string;
  readonly binaryName: string;
}

function getArchiveInfo(): ArchiveInfo {
  const { platform, arch } = process;

  if (platform === "linux" && arch === "x64") {
    return { suffix: "linux-amd64", binaryName: "promtool" };
  }

  if (platform === "darwin" && arch === "arm64") {
    return { suffix: "darwin-arm64", binaryName: "promtool" };
  }

  if (platform === "darwin" && arch === "x64") {
    return { suffix: "darwin-amd64", binaryName: "promtool" };
  }

  throw new Error(`Unsupported platform for promtool download: ${platform} ${arch}`);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function downloadFile(url: string, destination: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    https
      .get(url, (response) => {
        const status = response.statusCode ?? 0;

        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          downloadFile(response.headers.location, destination).then(resolve).catch(reject);
          return;
        }

        if (status !== 200) {
          reject(new Error(`Failed to download ${url}: HTTP ${status}`));
          response.resume();
          return;
        }

        const fileStream = createWriteStream(destination);
        response.pipe(fileStream);
        fileStream.on("finish", () => {
          fileStream.close();
          resolve();
        });
        fileStream.on("error", reject);
      })
      .on("error", reject);
  });
}

export async function ensurePromtool(): Promise<string> {
  if (PROMTOOL_PATH_OVERRIDE) {
    await access(PROMTOOL_PATH_OVERRIDE);
    return PROMTOOL_PATH_OVERRIDE;
  }

  const { suffix, binaryName } = getArchiveInfo();
  const cacheRoot = join(process.cwd(), "node_modules", ".cache", "promtool");
  const versionDir = join(cacheRoot, `v${PROMTOOL_VERSION}-${suffix}`);
  const binaryPath = join(versionDir, binaryName);

  if (await pathExists(binaryPath)) {
    return binaryPath;
  }

  await mkdir(versionDir, { recursive: true });

  const archiveFileName = `prometheus-${PROMTOOL_VERSION}.${suffix}.tar.gz`;
  const downloadUrl = `https://github.com/prometheus/prometheus/releases/download/v${PROMTOOL_VERSION}/${archiveFileName}`;

  const tempDir = await mkdtemp(join(tmpdir(), "promtool-"));
  const archivePath = join(tempDir, archiveFileName);

  try {
    await downloadFile(downloadUrl, archivePath);
    await tarModule.x({ file: archivePath, cwd: tempDir });

    const extractedBinaryPath = join(
      tempDir,
      `prometheus-${PROMTOOL_VERSION}.${suffix}`,
      binaryName,
    );

    await rename(extractedBinaryPath, binaryPath);

    if (process.platform !== "win32") {
      await chmod(binaryPath, 0o755);
    }
  } catch (error) {
    throw new PromtoolUnavailableError("Unable to download promtool binary", { cause: error });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  return binaryPath;
}
