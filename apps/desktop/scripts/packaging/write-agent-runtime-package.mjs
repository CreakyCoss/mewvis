import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const productConfigPath = join(desktopRoot, "product.config.json");
const desktopPackagePath = join(desktopRoot, "package.json");
const runtimesRoot = join(
  desktopRoot,
  "agent-runtime",
  "src",
  "engines",
  "drivers",
  "native",
  "agent",
  "runtimes",
);
const outputDir = join(desktopRoot, "agent-runtime", "dist");
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

const getRuntimeId = async (runtimeDir) => {
  const indexPath = join(runtimesRoot, runtimeDir, "index.ts");
  try {
    const content = await readFile(indexPath, "utf8");
    const match = content.match(/id:\s*["']([^"']+)["']/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
};

const getRegisteredRuntimeDirs = async () => {
  const registryPath = join(runtimesRoot, "registry.ts");
  const content = await readFile(registryPath, "utf8");
  const importRegex = /import\s+\{[^}]+\}\s+from\s+"\.\/([^/]+)\/index\.js"/g;
  const dirs = [];
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    dirs.push(match[1]);
  }
  return dirs;
};

const readRuntimePackageConfigs = async (productConfig) => {
  const registeredDirs = await getRegisteredRuntimeDirs();
  let packageConfig = {};

  for (const runtimeDir of registeredDirs) {
    const runtimeId = await getRuntimeId(runtimeDir);
    if (!runtimeId) continue;
    const runtimePackageConfig = await readRuntimePackageConfig(runtimeDir);
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
  name: productConfig.agentRuntimePackageName,
  version: desktopPackage.version ?? "0.0.0",
  private: true,
  type: "module",
  ...runtimePackageConfig,
};

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(runtimePackage, null, 2)}\n`);
