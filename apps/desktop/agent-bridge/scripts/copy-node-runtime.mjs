import { chmod, copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const bridgeRoot = join(scriptDir, "..");
const desktopRoot = join(bridgeRoot, "..");
const outputDir = join(bridgeRoot, "dist");
const targetDir = join(desktopRoot, "src-tauri", "target");
const cacheDir = join(targetDir, "node-runtime-cache");

const args = process.argv.slice(2);
const targetIndex = args.indexOf("--target");
const target = targetIndex !== -1 ? args[targetIndex + 1] : null;

const PLATFORM_MAP = {
  "win-x64": { os: "win", arch: "x64", binary: "node.exe" },
  "win-arm64": { os: "win", arch: "arm64", binary: "node.exe" },
  "darwin-x64": { os: "darwin", arch: "x64", binary: "node", archiveBinPath: "bin/node" },
  "darwin-arm64": { os: "darwin", arch: "arm64", binary: "node", archiveBinPath: "bin/node" },
  "linux-x64": { os: "linux", arch: "x64", binary: "node", archiveBinPath: "bin/node" },
  "linux-arm64": { os: "linux", arch: "arm64", binary: "node", archiveBinPath: "bin/node" },
};

await mkdir(outputDir, { recursive: true });

if (target) {
  const plat = PLATFORM_MAP[target];
  if (!plat) {
    console.error(`Unsupported target: ${target}. Supported: ${Object.keys(PLATFORM_MAP).join(", ")}`);
    process.exit(1);
  }

  const version = process.version;
  const ext = target.startsWith("win") ? "zip" : "tar.gz";
  const archiveName = `node-${version}-${plat.os}-${plat.arch}.${ext}`;
  const cacheName = `node-${version}-${target}-${plat.binary}`;
  const cachedBinaryPath = join(cacheDir, cacheName);
  const outputPath = join(outputDir, plat.binary);

  if (existsSync(cachedBinaryPath)) {
    await copyFile(cachedBinaryPath, outputPath);
    if (!target.startsWith("win")) {
      await chmod(outputPath, 0o755);
    }
    console.log(`Node.js binary for ${target} restored from cache ${cachedBinaryPath}`);
    process.exit(0);
  }

  if (existsSync(outputPath)) {
    await mkdir(cacheDir, { recursive: true });
    await copyFile(outputPath, cachedBinaryPath);
    if (!target.startsWith("win")) {
      await chmod(cachedBinaryPath, 0o755);
    }
    console.log(`Node.js binary for ${target} cached from existing ${outputPath}`);
    process.exit(0);
  }

  const url = `https://nodejs.org/dist/${version}/${archiveName}`;

  console.log(`Downloading Node.js ${version} for ${target}...`);

  const response = await fetch(url);
  if (!response.ok) {
    console.error(`Failed to download: ${response.status} ${response.statusText}`);
    process.exit(1);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const tmpDir = join(outputDir, ".node-download-tmp");
  await mkdir(tmpDir, { recursive: true });
  const tmpArchive = join(tmpDir, archiveName);
  await writeFile(tmpArchive, buffer);

  try {
    if (target.startsWith("win")) {
      execSync(`unzip -o "${tmpArchive}" -d "${tmpDir}"`, { stdio: "pipe" });
    } else {
      execSync(`tar -xzf "${tmpArchive}" -C "${tmpDir}"`, { stdio: "pipe" });
    }
  } catch (error) {
    console.error(`Failed to extract archive: ${error.stderr?.toString() || error.message}`);
    await rm(tmpDir, { recursive: true, force: true });
    process.exit(1);
  }

  const extractedDir = join(tmpDir, `node-${version}-${plat.os}-${plat.arch}`);
  const binarySrc = plat.archiveBinPath
    ? join(extractedDir, plat.archiveBinPath)
    : join(extractedDir, plat.binary);

  await copyFile(binarySrc, outputPath);
  await mkdir(cacheDir, { recursive: true });
  await copyFile(binarySrc, cachedBinaryPath);
  if (!target.startsWith("win")) {
    await chmod(outputPath, 0o755);
    await chmod(cachedBinaryPath, 0o755);
  }

  await rm(tmpDir, { recursive: true, force: true });
  console.log(`Node.js binary for ${target} saved to ${outputPath} and cached at ${cachedBinaryPath}`);
} else {
  const outputName = process.platform === "win32" ? "node.exe" : "node";
  const outputPath = join(outputDir, outputName);
  await copyFile(process.execPath, outputPath);

  if (process.platform !== "win32") {
    await chmod(outputPath, 0o755);
  }
  console.log(`Node.js binary copied to ${outputPath}`);
}
