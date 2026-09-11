import * as posixProcess from "./posix/process.js";
import * as windowsProcess from "./windows/process.js";
import * as posixChannel from "./posix/channel.js";
import * as windowsChannel from "./windows/channel.js";
import { platformKey } from "./resources.js";
import * as posixConfig from "./posix/config.js";
import * as windowsConfig from "./windows/config.js";
import type { ExecutionBackendConfig, ResolvedExecutionBackend } from "../execution/types.js";

export function resolveExecutionBackend(
  config: ExecutionBackendConfig,
  path: (value: string) => string,
  platform: NodeJS.Platform = process.platform,
): { backend: ResolvedExecutionBackend; systemWritePaths: string[] } {
  if (Object.hasOwn(config.options, "platform"))
    throw new Error("platform 是解析结果的保留字段，请在 backend.platforms 中配置平台参数。");
  const key = platformKey(platform);
  const resolved = { posix: posixConfig, windows: windowsConfig }[key].resolveSandboxConfig(
    config.platforms[key],
    path,
  );
  return {
    backend: {
      name: config.name,
      version: config.version,
      options: { ...structuredClone(config.options), platform: resolved },
    },
    systemWritePaths: resolved.kind === "posix" ? resolved.systemWritePaths : [],
  };
}

export function getProcessPlatform(platform: NodeJS.Platform = process.platform) {
  return { posix: posixProcess, windows: windowsProcess }[platformKey(platform)];
}

export function getChannelPlatform(platform: NodeJS.Platform = process.platform) {
  return { posix: posixChannel, windows: windowsChannel }[platformKey(platform)];
}

// Load SRT/account management only in launcher or setup processes, never while
// importing the execution client or worker API.
export async function loadSandboxPlatform(platform: NodeJS.Platform = process.platform) {
  return platformKey(platform) === "posix" ? import("./posix/sandbox.js") : import("./windows/sandbox.js");
}

export async function loadSetupPlatform(platform: NodeJS.Platform = process.platform) {
  return platformKey(platform) === "posix" ? import("./posix/sandbox.js") : import("./windows/setup.js");
}
