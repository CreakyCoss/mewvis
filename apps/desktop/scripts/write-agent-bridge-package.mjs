import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const productConfigPath = join(desktopRoot, "product.config.json");
const desktopPackagePath = join(desktopRoot, "package.json");
const runtimesRoot = join(desktopRoot, "agent-bridge", "src", "runtimes");
const outputDir = join(desktopRoot, "agent-bridge", "dist");
const outputPath = join(outputDir, "package.json");

const replaceConfigTokens = (value, runtimeId, productConfig) => {
  if (typeof value === "string") {
    return value
      .replaceAll("{runtimeId}", runtimeId)
      .replaceAll("{appDataDirName}", productConfig.appDataDirName);
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceConfigTokens(item, runtimeId, productConfig));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceConfigTokens(item, runtimeId, productConfig),
      ]),
    );
  }

  return value;
};

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const mergePackageConfig = (base, overrides) => {
  const result = { ...base };

  for (const [key, value] of Object.entries(overrides)) {
    result[key] =
      isPlainObject(result[key]) && isPlainObject(value)
        ? mergePackageConfig(result[key], value)
        : value;
  }

  return result;
};

const readRuntimePackageConfig = async (runtimeId) => {
  const configPath = join(runtimesRoot, runtimeId, "package.config.json");

  try {
    return JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {};
    }
    throw error;
  }
};

const readRuntimePackageConfigs = async (productConfig) => {
  const runtimeEntries = await readdir(runtimesRoot, { withFileTypes: true });
  let packageConfig = {};

  for (const entry of runtimeEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const runtimeId = entry.name;
    const runtimePackageConfig = await readRuntimePackageConfig(runtimeId);
    packageConfig = mergePackageConfig(
      packageConfig,
      replaceConfigTokens(runtimePackageConfig, runtimeId, productConfig),
    );
  }

  return packageConfig;
};

const productConfig = JSON.parse(await readFile(productConfigPath, "utf8"));
const desktopPackage = JSON.parse(await readFile(desktopPackagePath, "utf8"));
const runtimePackageConfig = await readRuntimePackageConfigs(productConfig);

const runtimePackage = {
  name: productConfig.agentBridgePackageName,
  version: desktopPackage.version ?? "0.0.0",
  private: true,
  type: "module",
  ...runtimePackageConfig,
};

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(runtimePackage, null, 2)}\n`);
