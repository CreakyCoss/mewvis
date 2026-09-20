import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface RuntimeConfig {
  nodeBinary: string;
  cliPath: string;
  protocolDir: string;
  dataDir: string;
  runtimeDataDir?: string;
  bundledSkillsPath?: string;
  bundledApplicationsPath?: string;
  appDataDirName: string;
  defaultWorkspaceDirName: string;
  env: NodeJS.ProcessEnv;
  idleTimeoutMs: number;
  idleCheckIntervalMs: number;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  heartbeatMaxMisses: number;
  stopTimeoutMs: number;
  shutdownGraceMs: number;
  outputDrainTimeoutMs: number;
  startupTimeoutMs: number;
  restartBackoffMs: number;
  maxRecoveryAttempts: number;
  diagnosticMaxBytes: number;
  diagnosticQueueBytes: number;
  diagnosticFlushTimeoutMs: number;
  rpcTimeoutMs: number;
  maxWorkers: number;
  maxQueuedTasks: number;
  maxLineBytes: number;
}

export function runtimeConfig(
  overrides: Partial<RuntimeConfig> = {},
): RuntimeConfig {
  // Resolve repository assets identically from src/config and dist/config.
  const client = fileURLToPath(new URL("../../../client/", import.meta.url));
  const runtime = fileURLToPath(
    new URL("../../../agent-runtime/", import.meta.url),
  );
  const resources = process.env.ISLE_SERVER_RESOURCES;
  const product = JSON.parse(
    readFileSync(
      resources
        ? join(resources, "product.config.json")
        : join(client, "../product.config.json"),
      "utf8",
    ),
  );
  const config: RuntimeConfig = {
    nodeBinary: process.env[`${product.envPrefix}_NODE`] ?? process.execPath,
    cliPath: resolve(
      process.env.ISLE_SERVER_RUNTIME_CLI ??
        process.env[`${product.envPrefix}_AGENT_RUNTIME`] ??
        join(resources ?? join(runtime, "dist"), "cli.js"),
    ),
    protocolDir: resources
      ? join(resources, "protocol/v1")
      : join(runtime, "protocol/v1"),
    dataDir: resolve(
      process.env.ISLE_SERVER_DATA_DIR ??
        join(homedir(), product.appDataDirName),
    ),
    bundledSkillsPath: resources
      ? join(resources, "skills")
      : join(client, "resources/skills"),

    appDataDirName: product.appDataDirName,
    defaultWorkspaceDirName: product.defaultWorkspaceDirName,
    env: { ...process.env },
    idleTimeoutMs: 180_000,
    idleCheckIntervalMs: 5_000,
    heartbeatIntervalMs: 15_000,
    heartbeatTimeoutMs: 10_000,
    heartbeatMaxMisses: 2,
    stopTimeoutMs: 5_000,
    shutdownGraceMs: 500,
    outputDrainTimeoutMs: 250,
    startupTimeoutMs: 10_000,
    restartBackoffMs: 200,
    maxRecoveryAttempts: 3,
    diagnosticMaxBytes: 2 * 1024 * 1024,
    diagnosticQueueBytes: 256 * 1024,
    diagnosticFlushTimeoutMs: 1_000,
    rpcTimeoutMs: 180_000,
    maxWorkers: 32,
    maxQueuedTasks: 128,
    maxLineBytes: 16 * 1024 * 1024,
    ...overrides,
  };
  config.runtimeDataDir ??= resolve(
    process.env.ISLE_SERVER_RUNTIME_DATA_DIR ??
      (overrides.dataDir || process.env.ISLE_SERVER_DATA_DIR
        ? config.dataDir
        : desktopRuntimeDirectory(product.bundleIdentifier)),
  );
  config.bundledApplicationsPath ??= join(dirname(config.cliPath), "apps");
  if (
    !config.defaultWorkspaceDirName ||
    /[/\\]/.test(config.defaultWorkspaceDirName) ||
    [".", ".."].includes(config.defaultWorkspaceDirName)
  )
    throw new Error("Invalid defaultWorkspaceDirName");
  for (const key of [
    "idleTimeoutMs",
    "idleCheckIntervalMs",
    "heartbeatIntervalMs",
    "heartbeatTimeoutMs",
    "heartbeatMaxMisses",
    "stopTimeoutMs",
    "shutdownGraceMs",
    "outputDrainTimeoutMs",
    "startupTimeoutMs",
    "restartBackoffMs",
    "maxRecoveryAttempts",
    "diagnosticMaxBytes",
    "diagnosticQueueBytes",
    "diagnosticFlushTimeoutMs",
    "rpcTimeoutMs",
    "maxWorkers",
    "maxQueuedTasks",
    "maxLineBytes",
  ] as const) {
    if (!Number.isSafeInteger(config[key]) || config[key] <= 0)
      throw new Error(`Invalid ${key}`);
  }
  return config;
}

export function assertRuntimeAvailable(config: RuntimeConfig) {
  if (!existsSync(config.cliPath)) {
    throw new Error(
      `Runtime CLI 不存在：${config.cliPath}。请先运行 pnpm build:runtime。`,
    );
  }
}

export function runtimeEnvironment(config: RuntimeConfig): NodeJS.ProcessEnv {
  return {
    ...config.env,
    ISLE_SANDBOX_SETTINGS_PATH: join(config.dataDir, "sandbox.json"),
    PI_PACKAGE_DIR: dirname(config.cliPath),
    PI_CODING_AGENT_DIR: join(
      config.runtimeDataDir ?? config.dataDir,
      "pi-agent",
    ),
  };
}

/** Tauri app.path().app_data_dir(), distinct from the product's home-directory config root. */
export function desktopRuntimeDirectory(
  identifier: string,
  platform = process.platform,
  home = homedir(),
  env = process.env,
) {
  const base =
    platform === "darwin"
      ? join(home, "Library", "Application Support")
      : platform === "win32"
        ? (env.APPDATA ?? join(home, "AppData", "Roaming"))
        : env.XDG_DATA_HOME || join(home, ".local", "share");
  return join(base, identifier);
}
