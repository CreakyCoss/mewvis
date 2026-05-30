import { chmod, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

const WINDOWS_MACHINE_BY_TARGET = {
  "win-x64": 0x8664,
  "win-arm64": 0xaa64,
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
    if (await isTargetBinaryCompatible(cachedBinaryPath, target)) {
      await copyFile(cachedBinaryPath, outputPath);
      if (!target.startsWith("win")) {
        await chmod(outputPath, 0o755);
      }
      console.log(`Node.js binary for ${target} restored from cache ${cachedBinaryPath}`);
      process.exit(0);
    }

    console.warn(`Ignoring incompatible cached Node.js binary for ${target}: ${cachedBinaryPath}`);
    await rm(cachedBinaryPath, { force: true });
  }

  await rm(outputPath, { force: true });

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

  if (!(await isTargetBinaryCompatible(binarySrc, target))) {
    console.error(`Downloaded Node.js binary is not compatible with ${target}: ${binarySrc}`);
    await rm(tmpDir, { recursive: true, force: true });
    process.exit(1);
  }

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

async function isTargetBinaryCompatible(path, target) {
  const expectedWindowsMachine = WINDOWS_MACHINE_BY_TARGET[target];
  if (!expectedWindowsMachine) {
    return true;
  }

  try {
    const buffer = await readFile(path);
    return readWindowsMachine(buffer) === expectedWindowsMachine;
  } catch {
    return false;
  }
}

function readWindowsMachine(buffer) {
  if (buffer.length < 0x40 || buffer.toString("ascii", 0, 2) !== "MZ") {
    return null;
  }

  const peOffset = buffer.readUInt32LE(0x3c);
  if (
    peOffset + 6 > buffer.length ||
    buffer.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0"
  ) {
    return null;
  }

  return buffer.readUInt16LE(peOffset + 4);
}
